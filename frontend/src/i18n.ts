export type Lang = "en" | "gu";

export const STRINGS = {
  app_name: { en: "Pramanik", gu: "પ્રમાણિક" },
  app_tagline: {
    en: "Verify & correct your documents — the smart way",
    gu: "દસ્તાવેજો ચકાસો અને સુધારો — સ્માર્ટ રીતે",
  },
  choose_language: { en: "Choose your language", gu: "તમારી ભાષા પસંદ કરો" },
  continue_english: { en: "Continue in English", gu: "Continue in English" },
  continue_gujarati: { en: "ગુજરાતી માં ચાલુ રાખો", gu: "ગુજરાતી માં ચાલુ રાખો" },
  login_title: { en: "Sign in with phone", gu: "ફોન વડે સાઈન-ઇન કરો" },
  login_sub: {
    en: "We'll send a one-time password (OTP) to verify your number.",
    gu: "તમારા નંબરની ચકાસણી માટે અમે OTP મોકલીશું.",
  },
  phone_label: { en: "Phone number", gu: "ફોન નંબર" },
  phone_ph: { en: "10-digit mobile number", gu: "10 અંકનો મોબાઈલ નંબર" },
  send_otp: { en: "Send OTP", gu: "OTP મોકલો" },
  enter_otp: { en: "Enter OTP", gu: "OTP દાખલ કરો" },
  otp_ph: { en: "6-digit OTP (dev: 123456)", gu: "6 અંકનો OTP (dev: 123456)" },
  verify: { en: "Verify", gu: "ચકાસો" },
  change_number: { en: "Change number", gu: "નંબર બદલો" },
  dashboard: { en: "Dashboard", gu: "ડેશબોર્ડ" },
  documents: { en: "Documents", gu: "દસ્તાવેજો" },
  expert: { en: "Expert", gu: "નિષ્ણાંત" },
  profile: { en: "Profile", gu: "પ્રોફાઈલ" },
  base_doc_label: { en: "Base Document (Ultimate Truth)", gu: "મુખ્ય દસ્તાવેજ (સાચો દસ્તાવેજ)" },
  base_doc_hint: {
    en: "We treat this document as the truth and verify others against it.",
    gu: "આ દસ્તાવેજને સાચો માની બાકીના ચકાસવામાં આવશે.",
  },
  birth: { en: "Birth Certificate", gu: "જન્મ પ્રમાણપત્ર" },
  lc: { en: "School Leaving Certificate (LC)", gu: "શાળા છોડ્યાનું પ્રમાણપત્ર" },
  passport: { en: "Passport", gu: "પાસપોર્ટ" },
  aadhaar: { en: "Aadhaar Card", gu: "આધાર કાર્ડ" },
  pan: { en: "PAN Card", gu: "પાન કાર્ડ" },
  voter_id: { en: "Voter ID", gu: "મતદાર ઓળખ કાર્ડ" },
  husband_aadhaar: { en: "Husband's Aadhaar", gu: "પતિનું આધાર" },
  married_lady_toggle: {
    en: "Is this for a married lady?",
    gu: "શું આ પરણિત મહિલા માટે છે?",
  },
  married_lady_hint: {
    en: "Base document has father's name, but Aadhaar/PAN has husband's name.",
    gu: "મુખ્ય દસ્તાવેજમાં પિતાનું નામ છે, જ્યારે આધાર/પાન માં પતિનું નામ હોય છે.",
  },
  add_doc: { en: "Add", gu: "ઉમેરો" },
  edit_doc: { en: "Edit", gu: "સંપાદન" },
  status_match: { en: "Match", gu: "મેળ ખાય" },
  status_mismatch: { en: "Mismatch", gu: "મેળ નથી" },
  status_pending: { en: "Pending", gu: "બાકી" },
  roadmap_title: { en: "Correction Roadmap", gu: "સુધારાનો રસ્તો" },
  step: { en: "Step", gu: "પગલું" },
  scan_title: { en: "Add document", gu: "દસ્તાવેજ ઉમેરો" },
  camera_scan: { en: "Camera Scan", gu: "કેમેરા સ્કેન" },
  gallery_upload: { en: "Upload from Gallery", gu: "ગૅલેરીમાંથી અપલોડ" },
  manual_entry: { en: "Manual Entry", gu: "હાથેથી દાખલ કરો" },
  name: { en: "Full name (as printed)", gu: "પૂરું નામ (દસ્તાવેજ મુજબ)" },
  first_name: { en: "First name", gu: "પ્રથમ નામ" },
  surname: { en: "Surname", gu: "અટક" },
  dob: { en: "Date of birth (DD/MM/YYYY)", gu: "જન્મ તારીખ (DD/MM/YYYY)" },
  doc_number: { en: "Document number", gu: "દસ્તાવેજ નંબર" },
  father_name: { en: "Father's name", gu: "પિતાનું નામ" },
  save: { en: "Save", gu: "સાચવો" },
  cancel: { en: "Cancel", gu: "રદ કરો" },
  processing: { en: "Reading document…", gu: "દસ્તાવેજ વાંચાય છે…" },
  retake: { en: "Retake", gu: "ફરી લો" },
  use_photo: { en: "Use this photo", gu: "આ ફોટો વાપરો" },
  permission_camera: {
    en: "Camera permission is needed to scan documents.",
    gu: "દસ્તાવેજ સ્કેન કરવા માટે કેમેરા પરવાનગી જરૂરી છે.",
  },
  grant_permission: { en: "Grant permission", gu: "પરવાનગી આપો" },
  expert_banner_title: {
    en: "Complex case? Talk to a Master Consultant live.",
    gu: "જટિલ કેસ છે? અમારા માસ્ટર કન્સલ્ટન્ટ સાથે લાઈવ વાત કરો.",
  },
  expert_banner_price: { en: "Only ₹29", gu: "ફક્ત ₹29" },
  book_expert_call: { en: "Book Expert Call", gu: "નિષ્ણાંત કોલ બુક કરો" },
  pick_slot: { en: "Pick a time slot", gu: "ટાઈમ સ્લોટ પસંદ કરો" },
  audio_call: { en: "Audio Call", gu: "ઑડિયો કોલ" },
  video_call: { en: "Video Call", gu: "વિડિયો કોલ" },
  pay_and_book: { en: "Pay ₹29 & Book", gu: "₹29 ચૂકવો અને બુક કરો" },
  booking_success: {
    en: "Booked! Confirmation sent to your WhatsApp.",
    gu: "બુક થયું! પુષ્ટિ તમારા WhatsApp પર મોકલાઈ.",
  },
  logout: { en: "Log out", gu: "લોગ આઉટ" },
  back: { en: "Back", gu: "પાછળ" },
  no_base_doc: {
    en: "Please select your Base Document above to start verification.",
    gu: "ચકાસણી શરૂ કરવા માટે ઉપર તમારો મુખ્ય દસ્તાવેજ પસંદ કરો.",
  },
  all_match: { en: "All your documents match.", gu: "તમારા તમામ દસ્તાવેજો મેળ ખાય છે." },
  delete: { en: "Delete", gu: "કાઢી નાખો" },
  saved: { en: "Saved", gu: "સચવાયું" },
  doc_type_mismatch_default: {
    en: "This is not the expected document. Please upload the correct one.",
    gu: "આ યોગ્ય દસ્તાવેજ નથી. મહેરબાની કરીને સાચો દસ્તાવેજ અપલોડ કરો.",
  },
  missing_phone: { en: "Enter a valid phone number", gu: "માન્ય ફોન નંબર દાખલ કરો" },
  missing_otp: { en: "Enter the 6-digit OTP", gu: "6 અંકનો OTP દાખલ કરો" },
  bookings: { en: "Your bookings", gu: "તમારી બુકિંગ" },
  no_bookings: { en: "No bookings yet.", gu: "હજુ કોઈ બુકિંગ નથી." },
  read_failed: { en: "Could not read the image. Try Manual Entry.", gu: "ઇમેજ વાંચી શકાયું નથી. હાથેથી દાખલ કરો." },
  lc_manual_warning: {
    en: "LC is not an online digital document, so you must fill in your details manually by looking at your LC.",
    gu: "LC ઓનલાઈન ડિજિટલ ડોક્યુમેન્ટ નથી, તેથી તમારે LC માં જોઈને તમારી વિગતો જાતે જ ભરવી પડશે.",
  },
};

export type StringKey = keyof typeof STRINGS;

export function t(lang: Lang, key: StringKey): string {
  const entry = STRINGS[key];
  if (!entry) return String(key);
  return entry[lang] ?? entry.en;
}
