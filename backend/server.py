from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import json
import re
import uuid
import jwt
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
JWT_SECRET = os.environ.get('JWT_SECRET', 'change_me')
DEV_OTP = os.environ.get('DEV_OTP', '123456')

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI()
api = APIRouter(prefix="/api")

logger = logging.getLogger("pramanik")
logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

# ---------- Models ----------

class RequestOtpIn(BaseModel):
    phone: str

class VerifyOtpIn(BaseModel):
    phone: str
    otp: str
    language: Optional[str] = "en"

class AuthOut(BaseModel):
    token: str
    user_id: str
    phone: str
    language: str

class OcrIn(BaseModel):
    image_base64: str
    expected_doc_type: str  # aadhaar | pan | voter_id | passport | birth | lc | husband_aadhaar

class ExtractedFields(BaseModel):
    name: Optional[str] = None
    dob: Optional[str] = None
    doc_number: Optional[str] = None
    father_name: Optional[str] = None
    surname: Optional[str] = None
    first_name: Optional[str] = None

class OcrOut(BaseModel):
    detected_type: str
    type_match: bool
    error_message: Optional[str] = None
    fields: ExtractedFields
    raw: Optional[str] = None

class DocumentIn(BaseModel):
    doc_type: str  # aadhaar | pan | voter_id | passport | birth | lc | husband_aadhaar
    name: Optional[str] = None
    dob: Optional[str] = None
    doc_number: Optional[str] = None
    father_name: Optional[str] = None
    surname: Optional[str] = None
    first_name: Optional[str] = None
    mode: str = "manual"  # manual | camera | gallery

class DocumentOut(DocumentIn):
    id: str
    user_id: str
    created_at: str

class ProfileStateIn(BaseModel):
    base_doc_type: Optional[str] = None
    is_married_lady: Optional[bool] = None
    language: Optional[str] = None

class BookingIn(BaseModel):
    slot_iso: str
    mode: str  # audio | video
    call_type: Optional[str] = None
    note: Optional[str] = None

# ---------- Helpers ----------

ALLOWED_DOC_TYPES = {"aadhaar", "pan", "voter_id", "passport", "birth", "lc", "husband_aadhaar"}

DOC_TYPE_LABELS = {
    "aadhaar": "Aadhaar Card",
    "pan": "PAN Card",
    "voter_id": "Voter ID",
    "passport": "Passport",
    "birth": "Birth Certificate",
    "lc": "School Leaving Certificate",
    "husband_aadhaar": "Husband's Aadhaar Card",
}

DOC_TYPE_GU = {
    "aadhaar": "આધાર કાર્ડ",
    "pan": "પાન કાર્ડ",
    "voter_id": "મતદાર ઓળખ કાર્ડ",
    "passport": "પાસપોર્ટ",
    "birth": "જન્મ પ્રમાણપત્ર",
    "lc": "શાળા છોડ્યાનું પ્રમાણપત્ર",
    "husband_aadhaar": "પતિનું આધાર કાર્ડ",
}

def make_jwt(user_id: str, phone: str) -> str:
    payload = {
        "user_id": user_id,
        "phone": phone,
        "exp": datetime.now(timezone.utc) + timedelta(days=30),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

def decode_jwt(token: str) -> Dict[str, Any]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def current_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    token = authorization.split(" ", 1)[1].strip()
    data = decode_jwt(token)
    user = await db.users.find_one({"id": data["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

def normalize(s: Optional[str]) -> str:
    if not s:
        return ""
    s = s.strip().lower()
    s = re.sub(r"[^a-z0-9\u0A80-\u0AFF ]", " ", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()

def names_match(a: Optional[str], b: Optional[str]) -> bool:
    na, nb = normalize(a), normalize(b)
    if not na or not nb:
        return False
    if na == nb:
        return True
    # token overlap based: at least 2 tokens or full token match
    ta, tb = set(na.split()), set(nb.split())
    inter = ta & tb
    if len(ta) <= 1 or len(tb) <= 1:
        return inter == ta or inter == tb
    return len(inter) >= max(2, min(len(ta), len(tb)) - 1)

def dob_match(a: Optional[str], b: Optional[str]) -> bool:
    if not a or not b:
        return False
    da = re.sub(r"[^0-9]", "", a)
    dbb = re.sub(r"[^0-9]", "", b)
    return da == dbb and len(da) >= 6

# ---------- OCR via GPT Vision ----------

OCR_SYSTEM_PROMPT = """You are an OCR and document verification assistant for Indian government documents (Aadhaar Card, PAN Card, Voter ID / EPIC, Passport, Birth Certificate, School Leaving Certificate / LC). The image may contain English and Gujarati text.

Return ONLY a valid JSON object (no markdown fences) with these keys:
{
  "detected_type": "aadhaar" | "pan" | "voter_id" | "passport" | "birth" | "lc" | "unknown",
  "name": "Full name printed on the document, or null",
  "first_name": "First/given name only, or null",
  "surname": "Surname / last name only, or null",
  "dob": "Date of birth in DD/MM/YYYY if present, else null",
  "doc_number": "The document number (Aadhaar 12-digit, PAN 10-char, EPIC, Passport, etc.) or null",
  "father_name": "Father/guardian name if printed, else null",
  "headers_found": ["list of distinctive headers/issuer text you actually read, e.g. 'Government of India', 'Income Tax Department', 'Election Commission of India', 'Unique Identification Authority of India', 'Republic of India', 'School Leaving Certificate', 'Birth Certificate'"]
}

Detection rules:
- 'Income Tax Department' OR 10-char alpha-num PAN format => "pan".
- 'Aadhaar' / 'Unique Identification Authority of India' / 12-digit Aadhaar => "aadhaar".
- 'Election Commission of India' / 'EPIC' / 'Voter' => "voter_id".
- 'Republic of India' + 'Passport' => "passport".
- 'Birth Certificate' / 'Janma Pramaan Patra' => "birth".
- 'School Leaving Certificate' / 'LC' / 'Transfer Certificate' => "lc".
- If unsure => "unknown".

Be strict. Output JSON only."""

async def gpt_ocr(image_base64: str) -> Dict[str, Any]:
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="LLM key not configured")
    # Strip data URI prefix if present
    if image_base64.startswith("data:"):
        image_base64 = image_base64.split(",", 1)[1]
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"ocr-{uuid.uuid4()}",
        system_message=OCR_SYSTEM_PROMPT,
    ).with_model("openai", "gpt-4o")
    msg = UserMessage(
        text="Extract structured fields from this Indian government document image. Return JSON only.",
        file_contents=[ImageContent(image_base64=image_base64)],
    )
    try:
        response = await chat.send_message(msg)
    except Exception as e:
        logger.exception("OCR LLM call failed")
        raise HTTPException(status_code=502, detail=f"OCR failed: {e}")
    text = response if isinstance(response, str) else str(response)
    # Best effort JSON extraction
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?", "", cleaned).strip()
    cleaned = re.sub(r"```$", "", cleaned).strip()
    m = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if not m:
        logger.error("OCR raw not JSON: %s", text)
        raise HTTPException(status_code=502, detail="OCR did not return JSON")
    try:
        data = json.loads(m.group(0))
    except Exception:
        raise HTTPException(status_code=502, detail="OCR JSON parse error")
    data["__raw"] = text
    return data

# ---------- Auth ----------

@api.get("/")
async def root():
    return {"app": "Pramanik", "status": "ok"}

@api.post("/auth/request-otp")
async def request_otp(payload: RequestOtpIn):
    phone = re.sub(r"[^0-9+]", "", payload.phone or "")
    if len(phone) < 10:
        raise HTTPException(status_code=400, detail="Invalid phone")
    # Dev mode: OTP is constant
    await db.otps.update_one(
        {"phone": phone},
        {"$set": {"phone": phone, "otp": DEV_OTP, "created_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"ok": True, "dev_mode": True, "message": "OTP sent. In dev mode use 123456."}

@api.post("/auth/verify-otp", response_model=AuthOut)
async def verify_otp(payload: VerifyOtpIn):
    phone = re.sub(r"[^0-9+]", "", payload.phone or "")
    if payload.otp.strip() != DEV_OTP:
        raise HTTPException(status_code=401, detail="Wrong OTP")
    user = await db.users.find_one({"phone": phone}, {"_id": 0})
    if not user:
        user = {
            "id": str(uuid.uuid4()),
            "phone": phone,
            "language": payload.language or "en",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(user.copy())
        await db.profiles.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "base_doc_type": None,
            "is_married_lady": False,
            "language": payload.language or "en",
        })
    else:
        if payload.language:
            await db.users.update_one({"id": user["id"]}, {"$set": {"language": payload.language}})
            user["language"] = payload.language
    token = make_jwt(user["id"], phone)
    return AuthOut(token=token, user_id=user["id"], phone=phone, language=user.get("language", "en"))

# ---------- Profile ----------

@api.get("/profile/state")
async def get_profile_state(user=Depends(current_user)):
    profile = await db.profiles.find_one({"user_id": user["id"]}, {"_id": 0})
    if not profile:
        profile = {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "base_doc_type": None,
            "is_married_lady": False,
            "language": user.get("language", "en"),
        }
        await db.profiles.insert_one(profile.copy())
    docs_cursor = db.documents.find({"user_id": user["id"]}, {"_id": 0})
    docs = await docs_cursor.to_list(50)
    return {"profile": profile, "documents": docs, "user": {"phone": user["phone"], "language": user.get("language", "en")}}

@api.put("/profile/state")
async def update_profile_state(payload: ProfileStateIn, user=Depends(current_user)):
    update = {k: v for k, v in payload.dict().items() if v is not None}
    if "base_doc_type" in update and update["base_doc_type"] not in {"birth", "lc", "passport", "aadhaar"}:
        raise HTTPException(status_code=400, detail="Base doc must be birth | lc | passport | aadhaar")
    if update:
        await db.profiles.update_one({"user_id": user["id"]}, {"$set": update}, upsert=True)
        if "language" in update:
            await db.users.update_one({"id": user["id"]}, {"$set": {"language": update["language"]}})
    profile = await db.profiles.find_one({"user_id": user["id"]}, {"_id": 0})
    return {"profile": profile}

# ---------- Documents ----------

@api.post("/documents", response_model=DocumentOut)
async def save_document(payload: DocumentIn, user=Depends(current_user)):
    if payload.doc_type not in ALLOWED_DOC_TYPES:
        raise HTTPException(status_code=400, detail="Unknown doc_type")
    doc = payload.dict()
    doc["id"] = str(uuid.uuid4())
    doc["user_id"] = user["id"]
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    # Upsert one per doc_type per user
    await db.documents.delete_many({"user_id": user["id"], "doc_type": payload.doc_type})
    await db.documents.insert_one(doc.copy())
    doc.pop("_id", None)
    return DocumentOut(**doc)

@api.delete("/documents/{doc_type}")
async def delete_document(doc_type: str, user=Depends(current_user)):
    if doc_type not in ALLOWED_DOC_TYPES:
        raise HTTPException(status_code=400, detail="Unknown doc_type")
    await db.documents.delete_many({"user_id": user["id"], "doc_type": doc_type})
    return {"ok": True}

# ---------- OCR ----------

@api.post("/ocr/extract", response_model=OcrOut)
async def ocr_extract(payload: OcrIn, user=Depends(current_user)):
    if payload.expected_doc_type not in ALLOWED_DOC_TYPES:
        raise HTTPException(status_code=400, detail="Unknown expected_doc_type")
    data = await gpt_ocr(payload.image_base64)
    detected = (data.get("detected_type") or "unknown").lower()
    # 'husband_aadhaar' is structurally aadhaar
    expected = "aadhaar" if payload.expected_doc_type == "husband_aadhaar" else payload.expected_doc_type
    type_match = (detected == expected)
    error_message = None
    if not type_match:
        en_label = DOC_TYPE_LABELS.get(payload.expected_doc_type, payload.expected_doc_type)
        gu_label = DOC_TYPE_GU.get(payload.expected_doc_type, payload.expected_doc_type)
        error_message = f"આ {gu_label} નથી, મહેરબાની કરીને સાચું ડોક્યુમેન્ટ અપલોડ કરો. (This does not look like a {en_label}. Please upload the correct document.)"
    fields = ExtractedFields(
        name=data.get("name"),
        dob=data.get("dob"),
        doc_number=data.get("doc_number"),
        father_name=data.get("father_name"),
        surname=data.get("surname"),
        first_name=data.get("first_name"),
    )
    return OcrOut(
        detected_type=detected,
        type_match=type_match,
        error_message=error_message,
        fields=fields,
        raw=data.get("__raw"),
    )

# ---------- Roadmap / verification engine ----------

def _doc_by_type(docs: List[Dict[str, Any]], t: str) -> Optional[Dict[str, Any]]:
    for d in docs:
        if d.get("doc_type") == t:
            return d
    return None

def _name_compare(base_name: str, other_name: str) -> Dict[str, Any]:
    ok = names_match(base_name, other_name)
    return {"ok": ok, "base": base_name, "other": other_name}

@api.get("/verify/roadmap")
async def verify_roadmap(user=Depends(current_user)):
    profile = await db.profiles.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    docs = await db.documents.find({"user_id": user["id"]}, {"_id": 0}).to_list(50)
    base_type = profile.get("base_doc_type")
    is_ml = bool(profile.get("is_married_lady"))
    issues: List[Dict[str, Any]] = []
    statuses: Dict[str, str] = {}  # doc_type -> match | mismatch | pending
    if not base_type:
        return {
            "ready": False,
            "base_doc_type": None,
            "is_married_lady": is_ml,
            "issues": [],
            "statuses": {},
            "roadmap": [],
            "needs_husband_aadhaar": is_ml,
        }
    base_doc = _doc_by_type(docs, base_type)
    if not base_doc:
        return {
            "ready": False,
            "base_doc_type": base_type,
            "is_married_lady": is_ml,
            "issues": [{"code": "base_missing", "message_en": "Please add your Base Document data first.",
                        "message_gu": "પહેલા તમારો મુખ્ય દસ્તાવેજ ઉમેરો."}],
            "statuses": {},
            "roadmap": [],
            "needs_husband_aadhaar": is_ml,
        }
    base_name = base_doc.get("name") or ""
    base_dob = base_doc.get("dob") or ""

    # Iterate verifiable docs (exclude whichever is currently the base)
    all_targets = ["aadhaar", "pan", "voter_id", "passport"]
    check_targets = [t for t in all_targets if t != base_type]
    husband_doc = _doc_by_type(docs, "husband_aadhaar") if is_ml else None
    needs_husband = is_ml and not husband_doc

    for t in check_targets:
        d = _doc_by_type(docs, t)
        if not d:
            statuses[t] = "pending"
            continue
        problems = []
        if is_ml:
            # Name in current doc should match HUSBAND's first+surname, not base father name
            if husband_doc:
                husband_name = (husband_doc.get("first_name") or "") + " " + (husband_doc.get("surname") or husband_doc.get("name") or "")
                husband_name = husband_name.strip() or (husband_doc.get("name") or "")
                if not names_match(husband_name, d.get("name")):
                    problems.append({
                        "code": "ml_name_mismatch",
                        "doc_type": t,
                        "message_en": f"Name on {DOC_TYPE_LABELS[t]} does not match husband's name from Husband Aadhaar.",
                        "message_gu": f"{DOC_TYPE_GU[t]} પર નામ પતિના આધાર સાથે મેળ ખાતું નથી.",
                    })
            else:
                problems.append({
                    "code": "ml_husband_required",
                    "doc_type": t,
                    "message_en": "Please add Husband's Aadhaar to verify the lady's name change.",
                    "message_gu": "મહેરબાની કરીને પતિનું આધાર ઉમેરો.",
                })
            # DOB must still match base
            if not dob_match(base_dob, d.get("dob")):
                problems.append({
                    "code": "dob_mismatch",
                    "doc_type": t,
                    "message_en": f"Date of birth on {DOC_TYPE_LABELS[t]} does not match {DOC_TYPE_LABELS[base_type]}.",
                    "message_gu": f"{DOC_TYPE_GU[t]} પર જન્મ તારીખ {DOC_TYPE_GU[base_type]} સાથે મેળ ખાતી નથી.",
                })
        else:
            # Normal: name & dob must match base
            if not names_match(base_name, d.get("name")):
                problems.append({
                    "code": "name_mismatch",
                    "doc_type": t,
                    "message_en": f"Name on {DOC_TYPE_LABELS[t]} does not match {DOC_TYPE_LABELS[base_type]}.",
                    "message_gu": f"{DOC_TYPE_GU[t]} પર નામ {DOC_TYPE_GU[base_type]} સાથે મેળ ખાતું નથી.",
                })
            if not dob_match(base_dob, d.get("dob")):
                problems.append({
                    "code": "dob_mismatch",
                    "doc_type": t,
                    "message_en": f"Date of birth on {DOC_TYPE_LABELS[t]} does not match {DOC_TYPE_LABELS[base_type]}.",
                    "message_gu": f"{DOC_TYPE_GU[t]} પર જન્મ તારીખ {DOC_TYPE_GU[base_type]} સાથે મેળ ખાતી નથી.",
                })
        if problems:
            statuses[t] = "mismatch"
            issues.extend(problems)
        else:
            statuses[t] = "match"

    # Build sequential roadmap. Aadhaar first if it's not the base, then PAN, then Voter ID, then Passport.
    order = [t for t in ["aadhaar", "pan", "voter_id", "passport"] if t != base_type]
    roadmap = []
    step = 1
    if needs_husband:
        roadmap.append({
            "step": step,
            "title_en": "Add Husband's Aadhaar",
            "title_gu": "પતિનું આધાર ઉમેરો",
            "detail_en": "Scan or enter your husband's Aadhaar Card so we can verify your name change.",
            "detail_gu": "મહેરબાની કરીને પતિનું આધાર સ્કેન અથવા દાખલ કરો.",
            "doc_type": "husband_aadhaar",
        })
        step += 1
    for t in order:
        if statuses.get(t) == "mismatch":
            prev_order = {"aadhaar": [], "pan": ["Aadhaar"], "voter_id": ["Aadhaar", "PAN"], "passport": ["Aadhaar", "PAN"]}
            prev = [p for p in prev_order.get(t, []) if p.lower().replace(" ", "_") != base_type]
            detail_en = f"Apply correction in {DOC_TYPE_LABELS[t]} to match {DOC_TYPE_LABELS[base_type]}."
            detail_gu = f"{DOC_TYPE_GU[t]} માં {DOC_TYPE_GU[base_type]} મુજબ સુધારો કરાવો."
            if prev:
                detail_en += f" Do this after fixing {', '.join(prev)}."
                detail_gu += f" પહેલા {', '.join(prev)} સુધારો."
            roadmap.append({
                "step": step,
                "title_en": f"Correct {DOC_TYPE_LABELS[t]}",
                "title_gu": f"{DOC_TYPE_GU[t]} માં સુધારો કરાવો",
                "detail_en": detail_en,
                "detail_gu": detail_gu,
                "doc_type": t,
            })
            step += 1
        elif statuses.get(t) == "pending":
            roadmap.append({
                "step": step,
                "title_en": f"Add {DOC_TYPE_LABELS[t]} data",
                "title_gu": f"{DOC_TYPE_GU[t]} નો ડેટા ઉમેરો",
                "detail_en": f"Please scan or enter your {DOC_TYPE_LABELS[t]}.",
                "detail_gu": f"મહેરબાની કરીને {DOC_TYPE_GU[t]} સ્કેન અથવા દાખલ કરો.",
                "doc_type": t,
            })
            step += 1
    if not roadmap:
        roadmap.append({
            "step": 1,
            "title_en": "All documents match!",
            "title_gu": "બધાં દસ્તાવેજો મેળ ખાય છે!",
            "detail_en": "Great — your documents are consistent with your base document.",
            "detail_gu": "ખુશીની વાત — તમારા તમામ દસ્તાવેજો સુસંગત છે.",
            "doc_type": None,
        })
    return {
        "ready": True,
        "base_doc_type": base_type,
        "is_married_lady": is_ml,
        "needs_husband_aadhaar": needs_husband,
        "issues": issues,
        "statuses": statuses,
        "roadmap": roadmap,
    }

# ---------- Expert booking (mock) ----------

@api.get("/expert/slots")
async def expert_slots(user=Depends(current_user)):
    now = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)  # IST
    slots: List[Dict[str, Any]] = []
    days_added = 0
    d = now
    while days_added < 3:
        d = d + timedelta(days=1)
        if d.weekday() == 6:  # Sunday closed
            continue
        date_label = d.strftime("%a, %d %b")
        times = ["10:00", "11:30", "13:00", "15:00", "16:30", "18:00"]
        slot_items = []
        for t in times:
            hh, mm = map(int, t.split(":"))
            iso_dt = d.replace(hour=hh, minute=mm, second=0, microsecond=0).isoformat()
            slot_items.append({"time_label": t, "slot_iso": iso_dt})
        slots.append({"date_label": date_label, "slots": slot_items})
        days_added += 1
    return {"slots": slots, "price_inr": 29}

@api.post("/expert/book")
async def expert_book(payload: BookingIn, user=Depends(current_user)):
    if payload.mode not in {"audio", "video"}:
        raise HTTPException(status_code=400, detail="mode must be audio or video")
    booking = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "phone": user["phone"],
        "slot_iso": payload.slot_iso,
        "mode": payload.mode,
        "note": payload.note,
        "status": "paid_mock",
        "amount_inr": 29,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.bookings.insert_one(booking.copy())
    booking.pop("_id", None)
    # Generate mock WhatsApp link
    whatsapp = ("https://wa.me/+91XXXXXXXXXX?text="
                f"Hi, I have booked an expert {payload.mode} call slot at {payload.slot_iso} (Booking ID: {booking['id']}).")
    return {"ok": True, "booking": booking, "whatsapp_link": whatsapp}

@api.get("/expert/bookings")
async def list_bookings(user=Depends(current_user)):
    items = await db.bookings.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return {"bookings": items}

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
