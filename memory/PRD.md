# Pramanik — PRD

## What it does
Pramanik is a Gujarat-focused, bilingual (English / ગુજરાતી) mobile app that helps citizens
verify and correct mismatches across their Indian government documents (Aadhaar, PAN, Voter ID),
using a self-selected "Base Document" (Birth Certificate / School Leaving Certificate / Passport)
as the source of truth.

## Stack
- Frontend: Expo / React Native (Expo Router), expo-camera, expo-image-picker
- Backend: FastAPI + MongoDB
- OCR: OpenAI GPT-4o Vision via `emergentintegrations` (EMERGENT_LLM_KEY)
- Auth: Phone OTP — dev mode (OTP = 123456) + JWT (HS256)

## Core flows
1. **Welcome / Language**: pick English or Gujarati on first launch.
2. **Phone OTP login**: enter phone → /auth/request-otp → enter OTP `123456` → /auth/verify-otp → JWT stored.
3. **Dashboard**: Base Document selector (chips), Married-Lady toggle, document status grid, sequential correction roadmap, Expert Call banner.
4. **Three-Way Doc Input** (`/scan/[doc]`): Camera scan (in-app), Gallery upload, or Manual Entry.
5. **OCR + Document type validation**: `/api/ocr/extract` runs GPT-4o Vision. If the user uploaded the wrong document type, a red Gujarati error banner is shown and data is NOT auto-filled.
6. **Married Lady workflow**: toggle ON → Husband Aadhaar tile appears → cross-match against current Aadhaar/PAN surname.
7. **Roadmap**: `/api/verify/roadmap` returns a step-by-step ordered guide (Aadhaar → PAN → Voter ID) based on mismatches with the base document.
8. **Expert ₹29 Call**: pick audio/video, choose slot (10am–6:30pm, next 3 working days), mocked payment, returns WhatsApp link for slot confirmation.

## Storage (MongoDB)
- `users` { id, phone, language, created_at }
- `profiles` { id, user_id, base_doc_type, is_married_lady, language }
- `documents` { id, user_id, doc_type, name, first_name, surname, dob, doc_number, father_name, mode, created_at }
- `bookings` { id, user_id, slot_iso, mode, status, amount_inr, created_at }
- `otps` { phone, otp, created_at } — text only, no document images persisted

## Key endpoints (all /api prefixed)
- POST /auth/request-otp, /auth/verify-otp
- GET/PUT /profile/state
- POST /documents, DELETE /documents/{doc_type}
- POST /ocr/extract  (image_base64 + expected_doc_type → fields + type_match)
- GET /verify/roadmap
- GET /expert/slots, POST /expert/book, GET /expert/bookings

## Smart business enhancement
The ₹29 Expert Call is positioned as a high-trust upgrade for users who see a "Mismatch" roadmap.
Conversion is naturally driven by the roadmap card right above the booking banner.
