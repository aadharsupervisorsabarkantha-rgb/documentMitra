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
    mother_name: Optional[str] = None
    surname: Optional[str] = None
    first_name: Optional[str] = None
    gender: Optional[str] = None  # "male" | "female" | "other"

class OcrOut(BaseModel):
    detected_type: str
    type_match: bool
    error_message: Optional[str] = None
    fields: ExtractedFields
    raw: Optional[str] = None

class DocumentIn(BaseModel):
    doc_type: str  # aadhaar | pan | voter_id | passport | birth | lc | husband_aadhaar | father_aadhaar | mother_aadhaar
    name: Optional[str] = None
    dob: Optional[str] = None
    doc_number: Optional[str] = None
    father_name: Optional[str] = None
    mother_name: Optional[str] = None
    surname: Optional[str] = None
    first_name: Optional[str] = None
    gender: Optional[str] = None
    mode: str = "manual"  # manual | camera | gallery

class DocumentOut(DocumentIn):
    id: str
    user_id: str
    created_at: str

class ProfileStateIn(BaseModel):
    base_doc_type: Optional[str] = None
    is_married_lady: Optional[bool] = None
    is_minor: Optional[bool] = None
    language: Optional[str] = None

class BookingIn(BaseModel):
    slot_iso: str
    mode: str  # audio | video
    call_type: Optional[str] = None
    note: Optional[str] = None

# ---------- Helpers ----------

ALLOWED_DOC_TYPES = {"aadhaar", "pan", "voter_id", "passport", "birth", "lc", "husband_aadhaar", "father_aadhaar", "mother_aadhaar"}

DOC_TYPE_LABELS = {
    "aadhaar": "Aadhaar Card",
    "pan": "PAN Card",
    "voter_id": "Voter ID / Election Card",
    "passport": "Passport",
    "birth": "Birth Certificate",
    "lc": "School Leaving Certificate",
    "husband_aadhaar": "Husband's Aadhaar Card",
    "father_aadhaar": "Father's Aadhaar Card",
    "mother_aadhaar": "Mother's Aadhaar Card",
}

DOC_TYPE_GU = {
    "aadhaar": "આધાર કાર્ડ",
    "pan": "પાન કાર્ડ",
    "voter_id": "ચૂંટણી કાર્ડ",
    "passport": "પાસપોર્ટ",
    "birth": "જન્મ પ્રમાણપત્ર",
    "lc": "શાળા છોડ્યાનું પ્રમાણપત્ર",
    "husband_aadhaar": "પતિનું આધાર કાર્ડ",
    "father_aadhaar": "પિતાનું આધાર કાર્ડ",
    "mother_aadhaar": "માતાનું આધાર કાર્ડ",
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

def calc_age(dob_str: Optional[str]) -> Optional[int]:
    """Parse DD/MM/YYYY (or with -, .) and return integer age."""
    if not dob_str:
        return None
    digits = re.sub(r"[^0-9]", "/", dob_str.strip())
    parts = [p for p in digits.split("/") if p]
    if len(parts) < 3:
        return None
    try:
        d, m, y = int(parts[0]), int(parts[1]), int(parts[2])
        if y < 100:
            y += 2000 if y < 30 else 1900
        if not (1 <= d <= 31 and 1 <= m <= 12 and 1900 <= y <= 2099):
            return None
        today = datetime.now(timezone.utc).date()
        years = today.year - y - ((today.month, today.day) < (m, d))
        return max(0, years)
    except Exception:
        return None

GENDER_PATTERNS = [
    (re.compile(r"\b(female|f/o|f )\b", re.I), "female"),
    (re.compile(r"\b(male|m/o|m )\b", re.I), "male"),
    (re.compile(r"મહિલા|સ્ત્રી"), "female"),
    (re.compile(r"પુરુષ"), "male"),
]

def detect_gender(*texts: Optional[str]) -> Optional[str]:
    blob = " ".join([t for t in texts if t]).strip()
    if not blob:
        return None
    for pat, g in GENDER_PATTERNS:
        if pat.search(blob):
            return g
    return None

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
  "mother_name": "Mother's name if printed (especially on Birth Certificates), else null",
  "gender": "One of 'male' | 'female' | 'other' based on text such as 'Male', 'Female', 'M', 'F', 'પુરુષ', 'મહિલા', 'સ્ત્રી'; else null",
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
            "is_minor": False,
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
            "is_minor": False,
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
    # married_lady and minor are mutually exclusive in the workflow
    if update.get("is_minor") is True:
        update["is_married_lady"] = False
    if update.get("is_married_lady") is True:
        update["is_minor"] = False
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

    # ---------- AUTO DETECT age / gender / minor when saving the BASE document ----------
    profile = await db.profiles.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    base_type = profile.get("base_doc_type")
    if base_type and payload.doc_type == base_type:
        age = calc_age(payload.dob)
        gender = (payload.gender or "").lower() or detect_gender(payload.name, payload.first_name)
        if gender not in {"male", "female", "other"}:
            gender = None
        is_minor = bool(age is not None and age < 18)
        update = {
            "detected_age": age,
            "detected_gender": gender,
            "is_minor": is_minor,
        }
        # Minor and married_lady are mutually exclusive; minor wins if both true.
        if is_minor:
            update["is_married_lady"] = False
        await db.profiles.update_one({"user_id": user["id"]}, {"$set": update}, upsert=True)
    return DocumentOut(**doc)

@api.delete("/documents/{doc_type}")
async def delete_document(doc_type: str, user=Depends(current_user)):
    if doc_type not in ALLOWED_DOC_TYPES:
        raise HTTPException(status_code=400, detail="Unknown doc_type")
    await db.documents.delete_many({"user_id": user["id"], "doc_type": doc_type})
    # If user deleted their base document, also wipe auto-detected attributes
    profile = await db.profiles.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    if profile.get("base_doc_type") == doc_type:
        await db.profiles.update_one(
            {"user_id": user["id"]},
            {"$set": {"detected_age": None, "detected_gender": None, "is_minor": False}},
        )
    return {"ok": True}

@api.post("/profile/reset")
async def profile_reset(user=Depends(current_user)):
    """Wipe all uploaded documents and reset toggles. Used when the user
    confirms changing their Base Document."""
    await db.documents.delete_many({"user_id": user["id"]})
    await db.profiles.update_one(
        {"user_id": user["id"]},
        {"$set": {
            "base_doc_type": None,
            "is_married_lady": False,
            "is_minor": False,
            "detected_age": None,
            "detected_gender": None,
        }},
        upsert=True,
    )
    return {"ok": True}

# ---------- OCR ----------

@api.post("/ocr/extract", response_model=OcrOut)
async def ocr_extract(payload: OcrIn, user=Depends(current_user)):
    if payload.expected_doc_type not in ALLOWED_DOC_TYPES:
        raise HTTPException(status_code=400, detail="Unknown expected_doc_type")
    data = await gpt_ocr(payload.image_base64)
    detected = (data.get("detected_type") or "unknown").lower()
    # ocr/extract handler — also adjust 'husband_aadhaar' etc structurally to aadhaar
    expected = payload.expected_doc_type
    if expected in {"husband_aadhaar", "father_aadhaar", "mother_aadhaar"}:
        expected = "aadhaar"
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
        mother_name=data.get("mother_name"),
        surname=data.get("surname"),
        first_name=data.get("first_name"),
        gender=(data.get("gender") or "").lower() or None,
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
    is_minor = bool(profile.get("is_minor"))
    issues: List[Dict[str, Any]] = []
    statuses: Dict[str, str] = {}
    roadmap: List[Dict[str, Any]] = []

    def step(title_en, title_gu, detail_en, detail_gu, doc_type=None):
        roadmap.append({
            "step": len(roadmap) + 1,
            "title_en": title_en,
            "title_gu": title_gu,
            "detail_en": detail_en,
            "detail_gu": detail_gu,
            "doc_type": doc_type,
        })

    if not base_type:
        return {
            "ready": False, "base_doc_type": None,
            "is_married_lady": is_ml, "is_minor": is_minor,
            "needs_husband_aadhaar": is_ml, "needs_father_aadhaar": is_minor, "needs_mother_aadhaar": is_minor,
            "issues": [], "statuses": {}, "roadmap": [],
        }
    base_doc = _doc_by_type(docs, base_type)

    # ---------- MINOR FLOW (must be base=birth) ----------
    if is_minor:
        father = _doc_by_type(docs, "father_aadhaar")
        mother = _doc_by_type(docs, "mother_aadhaar")
        # Single-parent flexibility: at least ONE parent's Aadhaar is required.
        needs_any_parent = (not father) and (not mother)
        needs_father = not father  # for UI hints only
        needs_mother = not mother
        if base_type != "birth":
            step("Use Birth Certificate as Base",
                 "Minor માટે જન્મ પ્રમાણપત્ર base તરીકે પસંદ કરો",
                 "For minor applicants, the Base Document must be the child's Birth Certificate.",
                 "Minor (બાળક) માટે Base Document તરીકે જન્મ પ્રમાણપત્ર પસંદ કરવું ફરજિયાત છે.",
                 doc_type="birth")
            return {
                "ready": False, "base_doc_type": base_type,
                "is_married_lady": False, "is_minor": True,
                "needs_father_aadhaar": needs_father, "needs_mother_aadhaar": needs_mother,
                "issues": [], "statuses": {}, "roadmap": roadmap,
            }
        if not base_doc:
            step("Add Birth Certificate data", "જન્મ પ્રમાણપત્ર ઉમેરો",
                 "Please add child's Birth Certificate (name, DOB, father, mother).",
                 "બાળકના જન્મ પ્રમાણપત્રની વિગતો ઉમેરો (નામ, જન્મતારીખ, પિતાનું નામ, માતાનું નામ).",
                 doc_type="birth")
        birth_father = (base_doc or {}).get("father_name") or ""
        birth_mother = (base_doc or {}).get("mother_name") or ""

        # Status for parent aadhaars
        if not father:
            statuses["father_aadhaar"] = "pending"
        else:
            father_ok = names_match(birth_father, father.get("name"))
            statuses["father_aadhaar"] = "match" if father_ok else "mismatch"
        if not mother:
            statuses["mother_aadhaar"] = "pending"
        else:
            mother_ok = names_match(birth_mother, mother.get("name"))
            statuses["mother_aadhaar"] = "match" if mother_ok else "mismatch"

        if needs_any_parent:
            step("Upload at least one Parent's Aadhaar (mandatory)",
                 "ઓછામાં ઓછું એક માતા-પિતાનું આધાર ઉમેરો (ફરજિયાત)",
                 "For minor cases at least one parent's Aadhaar (Father OR Mother) is required.",
                 "Minor કેસ માટે પિતા અથવા માતા — ઓછામાં ઓછું એક આધાર ઉમેરવું ફરજિયાત છે.",
                 doc_type="father_aadhaar")
        if father and birth_father and statuses["father_aadhaar"] == "mismatch":
            issues.append({
                "code": "minor_father_name_mismatch",
                "message_en": "Father's name on Birth Certificate does not match Father's Aadhaar Card.",
                "message_gu": "જન્મ પ્રમાણપત્ર પર પિતાનું નામ પિતાના આધાર સાથે મેળ ખાતું નથી.",
            })
            step("Fix Father's name mismatch",
                 "પિતાનું નામ સુધારો",
                 "Father's name on Birth Certificate and Father's Aadhaar must match exactly. Get the mismatch corrected at the nearest CSC.",
                 "જન્મ પ્રમાણપત્ર અને પિતાના આધારમાં પિતાનું નામ 100% સરખું હોવું જરૂરી છે. નજીકના CSC પર સુધારો કરાવો.",
                 doc_type="father_aadhaar")
        if mother and birth_mother and statuses["mother_aadhaar"] == "mismatch":
            issues.append({
                "code": "minor_mother_name_mismatch",
                "message_en": "Mother's name on Birth Certificate does not match Mother's Aadhaar Card.",
                "message_gu": "જન્મ પ્રમાણપત્ર પર માતાનું નામ માતાના આધાર સાથે મેળ ખાતું નથી.",
            })
            step("Fix Mother's name mismatch",
                 "માતાનું નામ સુધારો",
                 "Mother's name on Birth Certificate and Mother's Aadhaar must match exactly. Get the mismatch corrected at the nearest CSC.",
                 "જન્મ પ્રમાણપત્ર અને માતાના આધારમાં માતાનું નામ 100% સરખું હોવું જરૂરી છે. નજીકના CSC પર સુધારો કરાવો.",
                 doc_type="mother_aadhaar")

        ready_to_correct_minor = (
            base_doc is not None and not needs_any_parent and
            (not father or statuses.get("father_aadhaar") == "match") and
            (not mother or statuses.get("mother_aadhaar") == "match")
        )
        if ready_to_correct_minor:
            step("Correct Minor's Aadhaar Card",
                 "બાળકના આધાર કાર્ડમાં સુધારો કરાવો",
                 "Visit the nearest CSC with the child's Birth Certificate and both parents' Aadhaar Cards to apply the Aadhaar correction for the minor.",
                 "નજીકના CSC પર જઈ બાળકના જન્મ પ્રમાણપત્ર અને માતા-પિતા બંનેના આધાર સાથે Minor ના આધાર કાર્ડમાં સુધારો કરાવો.",
                 doc_type="aadhaar")
        return {
            "ready": ready_to_correct_minor,
            "base_doc_type": base_type, "is_married_lady": False, "is_minor": True,
            "needs_father_aadhaar": needs_father, "needs_mother_aadhaar": needs_mother,
            "needs_husband_aadhaar": False,
            "issues": issues, "statuses": statuses, "roadmap": roadmap,
        }

    if not base_doc:
        step("Add your Base Document data", "મુખ્ય દસ્તાવેજનો ડેટા ઉમેરો",
             "Please add your Base Document details first.",
             "પહેલા તમારો મુખ્ય દસ્તાવેજ ઉમેરો.",
             doc_type=base_type)
        return {
            "ready": False, "base_doc_type": base_type,
            "is_married_lady": is_ml, "is_minor": False,
            "needs_husband_aadhaar": is_ml,
            "needs_father_aadhaar": False, "needs_mother_aadhaar": False,
            "issues": [], "statuses": {}, "roadmap": roadmap,
        }

    base_name = base_doc.get("name") or ""
    base_dob = base_doc.get("dob") or ""

    # ---------- compute statuses on identity docs ----------
    all_targets = ["aadhaar", "pan", "voter_id", "passport"]
    check_targets = [t for t in all_targets if t != base_type]
    husband_doc = _doc_by_type(docs, "husband_aadhaar") if is_ml else None
    needs_husband = is_ml and not husband_doc

    husband_name = ""
    if husband_doc:
        husband_name = ((husband_doc.get("first_name") or "") + " " +
                        (husband_doc.get("surname") or husband_doc.get("name") or "")).strip() or (husband_doc.get("name") or "")

    for t in check_targets:
        d = _doc_by_type(docs, t)
        if not d:
            statuses[t] = "pending"
            continue
        if is_ml:
            name_ok = bool(husband_doc) and names_match(husband_name, d.get("name"))
        else:
            name_ok = names_match(base_name, d.get("name"))
        dob_ok = dob_match(base_dob, d.get("dob"))
        statuses[t] = "match" if (name_ok and dob_ok) else "mismatch"
        if not name_ok:
            issues.append({
                "code": "name_mismatch", "doc_type": t,
                "message_en": f"Name on {DOC_TYPE_LABELS[t]} does not match the source of truth.",
                "message_gu": f"{DOC_TYPE_GU[t]} પર નામ મેળ ખાતું નથી.",
            })
        if not dob_ok:
            issues.append({
                "code": "dob_mismatch", "doc_type": t,
                "message_en": f"Date of birth on {DOC_TYPE_LABELS[t]} does not match {DOC_TYPE_LABELS[base_type]}.",
                "message_gu": f"{DOC_TYPE_GU[t]} પર જન્મ તારીખ {DOC_TYPE_GU[base_type]} સાથે મેળ ખાતી નથી.",
            })

    # ---------- MARRIED LADY hierarchy ----------
    if is_ml:
        if needs_husband:
            step("Add Husband's Aadhaar",
                 "પતિનું આધાર ઉમેરો",
                 "Please scan or enter Husband's Aadhaar so we can verify your name change.",
                 "મહેરબાની કરીને પતિનું આધાર સ્કેન અથવા દાખલ કરો.",
                 doc_type="husband_aadhaar")
        if statuses.get("aadhaar") == "mismatch":
            step("Step 1 — Correct Election Card first",
                 "પગલું 1 — સૌપ્રથમ ચૂંટણી કાર્ડ સુધારો",
                 "Using your Marriage Certificate, first correct your Election Card (Voter ID) at the BLO / Mamlatdar office.",
                 "Marriage Certificate ના આધારે સૌથી પહેલા ચૂંટણી કાર્ડ (Election Card) માં સુધારો કરવો પડશે.",
                 doc_type="voter_id")
            step("Step 2 — Correct Aadhaar Card",
                 "પગલું 2 — આધાર કાર્ડ સુધારો",
                 "Only after the Election Card is corrected, update your Aadhaar Card with the husband's surname.",
                 "ચૂંટણી કાર્ડ સુધર્યા પછી જ આધાર કાર્ડ (Aadhaar Card) માં સુધારો થશે.",
                 doc_type="aadhaar")
            step("Step 3 — Correct PAN Card",
                 "પગલું 3 — પાન કાર્ડ સુધારો",
                 "Finally, update the PAN Card using the corrected Aadhaar.",
                 "છેલ્લે, પાન કાર્ડ (PAN Card) માં સુધારો થશે.",
                 doc_type="pan")
        elif statuses.get("pan") == "mismatch":
            step("Correct PAN Card",
                 "પાન કાર્ડ સુધારો",
                 "Update PAN using the corrected Aadhaar/Election Card.",
                 "સુધારેલા આધાર/ચૂંટણી કાર્ડના આધારે PAN સુધારો.",
                 doc_type="pan")
        elif statuses.get("voter_id") == "mismatch":
            step("Correct Election Card",
                 "ચૂંટણી કાર્ડ સુધારો",
                 "Update your Election Card with husband's surname using Marriage Certificate.",
                 "Marriage Certificate ના આધારે ચૂંટણી કાર્ડમાં સુધારો કરાવો.",
                 doc_type="voter_id")
        if not roadmap:
            step("All documents match!", "બધાં દસ્તાવેજો મેળ ખાય છે!",
                 "Great — your documents are consistent with your husband's Aadhaar.",
                 "ખુશીની વાત — તમારા તમામ દસ્તાવેજો સુસંગત છે.")
        return {
            "ready": not needs_husband,
            "base_doc_type": base_type, "is_married_lady": True, "is_minor": False,
            "needs_husband_aadhaar": needs_husband,
            "needs_father_aadhaar": False, "needs_mother_aadhaar": False,
            "issues": issues, "statuses": statuses, "roadmap": roadmap,
        }

    # ---------- NORMAL FLOW (specific Gujarati guidance) ----------
    # Case A: base = Birth Certificate and Aadhaar mismatch
    if base_type == "birth" and statuses.get("aadhaar") == "mismatch":
        step("Step 1 — Correct Election Card first",
             "પગલું 1 — સૌપ્રથમ ચૂંટણી કાર્ડ સુધારો",
             "First correct your Election Card via the local BLO (Booth Level Officer) or Mamlatdar office using your Birth Certificate.",
             "સૌથી પહેલા ચૂંટણી કાર્ડ (Election Card) માં સુધારો કરવો પડશે. આ સુધારો તમારા વિસ્તારના BLO (Booth Level Officer) પાસે અથવા મામલતદાર ઓફિસમાં જન્મ પ્રમાણપત્રના આધારે ઇલેક્શન ડિપાર્ટમેન્ટમાં થશે.",
             doc_type="voter_id")
        step("Step 2 — Correct Aadhaar Card",
             "પગલું 2 — આધાર કાર્ડ સુધારો",
             "Only after the Election Card is corrected, proceed with the Aadhaar Card update.",
             "ચૂંટણી કાર્ડ સુધરી ગયા પછી જ આધાર કાર્ડ (Aadhaar Card) નું કામ આગળ થશે.",
             doc_type="aadhaar")
        if statuses.get("pan") == "mismatch":
            step("Step 3 — Correct PAN Card",
                 "પગલું 3 — પાન કાર્ડ સુધારો",
                 "After Aadhaar is corrected, apply the PAN correction using the updated Aadhaar.",
                 "આધાર સુધર્યા પછી, સુધારેલા આધારના આધારે PAN કાર્ડમાં સુધારો કરાવો.",
                 doc_type="pan")
        return {
            "ready": True,
            "base_doc_type": base_type, "is_married_lady": False, "is_minor": False,
            "needs_husband_aadhaar": False,
            "needs_father_aadhaar": False, "needs_mother_aadhaar": False,
            "issues": issues, "statuses": statuses, "roadmap": roadmap,
        }

    # Case B: Aadhaar is correct, Election Card is wrong
    if statuses.get("aadhaar") == "match" and statuses.get("voter_id") == "mismatch":
        step("Visit nearest CSC for Election Card correction",
             "નજીકના CSC પર જઈ ચૂંટણી કાર્ડ સુધારો",
             "Visit the nearest CSC (Common Service Centre) and correct your Election Card using your Aadhaar Card.",
             "નજીકના CSC (કોમન સર્વિસ સેન્ટર) પર જાઓ અને આધાર કાર્ડના આધારે ચૂંટણી કાર્ડમાં સુધારો કરાવો.",
             doc_type="voter_id")
        if statuses.get("pan") == "mismatch":
            step("Then correct PAN Card",
                 "ત્યારબાદ પાન કાર્ડ સુધારો",
                 "After that, use the corrected Election Card and Aadhaar to update the PAN Card.",
                 "ત્યારબાદ, સુધારેલા ચૂંટણી કાર્ડ અને આધાર કાર્ડનો ઉપયોગ કરીને પાન કાર્ડ (PAN Card) માં સુધારો થશે.",
                 doc_type="pan")
        return {
            "ready": True,
            "base_doc_type": base_type, "is_married_lady": False, "is_minor": False,
            "needs_husband_aadhaar": False,
            "needs_father_aadhaar": False, "needs_mother_aadhaar": False,
            "issues": issues, "statuses": statuses, "roadmap": roadmap,
        }

    # ---------- Generic fallback ----------
    order = [t for t in ["aadhaar", "pan", "voter_id", "passport"] if t != base_type]
    for t in order:
        if statuses.get(t) == "mismatch":
            step(f"Correct {DOC_TYPE_LABELS[t]}",
                 f"{DOC_TYPE_GU[t]} માં સુધારો કરાવો",
                 f"Apply correction in {DOC_TYPE_LABELS[t]} to match {DOC_TYPE_LABELS[base_type]}.",
                 f"{DOC_TYPE_GU[t]} માં {DOC_TYPE_GU[base_type]} મુજબ સુધારો કરાવો.",
                 doc_type=t)
        elif statuses.get(t) == "pending":
            step(f"Add {DOC_TYPE_LABELS[t]} data",
                 f"{DOC_TYPE_GU[t]} નો ડેટા ઉમેરો",
                 f"Please scan or enter your {DOC_TYPE_LABELS[t]}.",
                 f"મહેરબાની કરીને {DOC_TYPE_GU[t]} સ્કેન અથવા દાખલ કરો.",
                 doc_type=t)
    if not roadmap:
        step("All documents match!", "બધાં દસ્તાવેજો મેળ ખાય છે!",
             "Great — your documents are consistent with your base document.",
             "ખુશીની વાત — તમારા તમામ દસ્તાવેજો સુસંગત છે.")
    return {
        "ready": True,
        "base_doc_type": base_type, "is_married_lady": False, "is_minor": False,
        "needs_husband_aadhaar": False,
        "needs_father_aadhaar": False, "needs_mother_aadhaar": False,
        "issues": issues, "statuses": statuses, "roadmap": roadmap,
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
    profile = await db.profiles.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    if profile.get("is_minor"):
        # Single-parent flexibility: at least ONE parent's Aadhaar is required.
        father = await db.documents.find_one({"user_id": user["id"], "doc_type": "father_aadhaar"}, {"_id": 0})
        mother = await db.documents.find_one({"user_id": user["id"], "doc_type": "mother_aadhaar"}, {"_id": 0})
        if not father and not mother:
            raise HTTPException(
                status_code=400,
                detail="Minor case requires at least one parent's Aadhaar (Father OR Mother) before booking. "
                       "Minor (બાળક) કેસ માટે પિતા અથવા માતા — ઓછામાં ઓછું એક આધાર ઉમેરવું ફરજિયાત છે.",
            )
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
