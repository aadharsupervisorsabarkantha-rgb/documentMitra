# DocumentMitra (ડોક્યુમેન્ટ મિત્ર) — PRD

## What it does
DocumentMitra is a Gujarat-focused bilingual (English / ગુજરાતી) mobile app that helps citizens
verify and correct mismatches across their Indian government documents using a self-selected
"Base Document" (Birth Certificate / School Leaving Certificate / Passport / Aadhaar) as the
source of truth, with specialized workflows for Married Ladies and Minor (child) applicants.

## Stack
- Frontend: Expo / React Native (Expo Router), expo-camera, expo-image-picker
- Backend: FastAPI + MongoDB
- OCR: OpenAI GPT-4o Vision via `emergentintegrations` (EMERGENT_LLM_KEY)
- Auth: Phone OTP — dev mode (OTP = 123456) + JWT (HS256)

## Core flows
1. **Welcome / Language**: choose English or Gujarati.
2. **Phone OTP login** (dev OTP 123456).
3. **Dashboard**:
   - Base Document chips: Birth / LC / Passport / Aadhaar
   - Toggles: "Is this for a married lady?" + "Is this for a minor (child)?" (mutually exclusive)
   - Document grid (auto-excludes the chosen base; auto-includes Husband/Father/Mother Aadhaar slots when relevant)
   - Sequential correction roadmap card (exact Gujarati instructions)
   - Expert ₹29 banner

4. **Three-Way Doc Input** (`/scan/[doc]`): Camera / Gallery / Manual; LC is manual-only with a Gujarati warning.

5. **OCR + Document type validation**: GPT-4o Vision. Wrong type → red Gujarati banner, data NOT autofilled.

6. **Roadmap decision tree** (`/api/verify/roadmap`):
   - **Base = Birth Cert + Aadhaar mismatch** → exact 2-step BLO/Mamlatdar guidance in Gujarati.
   - **Aadhaar correct + Voter ID wrong** → exact CSC guidance + PAN cascade.
   - **Married Lady + Aadhaar mismatch** → exact 3-step Marriage Cert → Election → Aadhaar → PAN.
   - **Minor flow** (isolated): mandates child's Birth Certificate + Father's Aadhaar + Mother's Aadhaar; OCR extracts mother_name; 100% name match required, else alert; booking blocked until both parents added.

7. **Expert ₹29 Call** (mocked payment): audio/video, slot picker (10am–6:30pm, Mon–Sat, next 3 working days), WhatsApp link returned.

## Storage (MongoDB)
- `users`, `profiles` (now with `is_minor`), `documents` (with `mother_name`), `bookings`, `otps` — all text-only.

## Key endpoints (all /api prefixed)
- POST /auth/request-otp, /auth/verify-otp
- GET/PUT /profile/state    (toggles: is_married_lady, is_minor — mutually exclusive)
- POST /documents, DELETE /documents/{doc_type}
- POST /ocr/extract  (image_base64 + expected_doc_type → fields incl. mother_name + type_match)
- GET /verify/roadmap  (new decision-tree engine)
- GET /expert/slots, POST /expert/book (blocks if minor case is missing parent Aadhaars), GET /expert/bookings

## Smart business enhancement
Expert ₹29 booking is naturally triggered by the user reading a multi-step "Mismatch" roadmap — high relevance, high conversion.
