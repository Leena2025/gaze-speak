// Quick-need phrases. Each entry has English and Tamil text, so the
// interface can switch language without code changes. Add a language by
// adding its key to every entry (and to SPEECH_LANGS in app/speech.js).
//
// Tamil text was written for this app and should be checked by a native
// speaker before real use.

export const PHRASE_CATEGORIES = Object.freeze([
  {
    id: "personal",
    label: { en: "Personal needs", ta: "தனிப்பட்ட தேவைகள்" },
    icon: "🙋",
    phrases: [
      { id: "hungry", icon: "🍽️", text: { en: "I am hungry.", ta: "எனக்குப் பசிக்கிறது." } },
      { id: "thirsty", icon: "💧", text: { en: "I am thirsty.", ta: "எனக்குத் தாகமாக இருக்கிறது." } },
      { id: "bathroom", icon: "🚻", text: { en: "I need to use the bathroom.", ta: "நான் கழிவறைக்குப் போக வேண்டும்." } },
      { id: "tired", icon: "🥱", text: { en: "I am tired.", ta: "எனக்குக் களைப்பாக இருக்கிறது." } },
      { id: "uncomfortable", icon: "😣", text: { en: "I am feeling uncomfortable.", ta: "எனக்குச் சங்கடமாக இருக்கிறது." } },
    ],
  },
  {
    id: "health",
    label: { en: "Health and comfort", ta: "உடல்நலம், வசதி" },
    icon: "🩺",
    phrases: [
      { id: "pain", icon: "🤕", text: { en: "I am in pain.", ta: "எனக்கு வலிக்கிறது." } },
      { id: "unwell", icon: "🤒", text: { en: "I do not feel well.", ta: "எனக்கு உடம்பு சரியில்லை." } },
      { id: "medicine", icon: "💊", text: { en: "I need my medicine.", ta: "எனக்கு என் மருந்து வேண்டும்." } },
      { id: "position", icon: "🛏️", text: { en: "Please adjust my position.", ta: "தயவுசெய்து என் நிலையை மாற்றுங்கள்." } },
      { id: "rest", icon: "😴", text: { en: "I need some rest.", ta: "எனக்குக் கொஞ்சம் ஓய்வு வேண்டும்." } },
      { id: "cold", icon: "🥶", text: { en: "I feel cold.", ta: "எனக்குக் குளிராக இருக்கிறது." } },
      { id: "hot", icon: "🥵", text: { en: "I feel hot.", ta: "எனக்கு வெப்பமாக இருக்கிறது." } },
    ],
  },
  {
    id: "family",
    label: { en: "Family and assistance", ta: "குடும்பம், உதவி" },
    icon: "👪",
    phrases: [
      { id: "call-son", icon: "👦", text: { en: "Please call my son.", ta: "தயவுசெய்து என் மகனை அழையுங்கள்." } },
      { id: "call-daughter", icon: "👧", text: { en: "Please call my daughter.", ta: "தயவுசெய்து என் மகளை அழையுங்கள்." } },
      { id: "call-caregiver", icon: "🧑‍⚕️", text: { en: "Please call my caregiver.", ta: "தயவுசெய்து என் பராமரிப்பாளரை அழையுங்கள்." } },
      { id: "come-here", icon: "👋", text: { en: "Please come here.", ta: "தயவுசெய்து இங்கே வாருங்கள்." } },
      { id: "stay", icon: "🤝", text: { en: "Please stay with me.", ta: "தயவுசெய்து என்னுடன் இருங்கள்." } },
    ],
  },
  {
    id: "general",
    label: { en: "General", ta: "பொது" },
    icon: "💬",
    phrases: [
      { id: "yes", icon: "👍", text: { en: "Yes.", ta: "ஆம்." } },
      { id: "no", icon: "👎", text: { en: "No.", ta: "இல்லை." } },
      { id: "thanks", icon: "🙏", text: { en: "Thank you.", ta: "நன்றி." } },
      { id: "help", icon: "🆘", text: { en: "I need help.", ta: "எனக்கு உதவி வேண்டும்." } },
      { id: "wait", icon: "✋", text: { en: "Please wait.", ta: "தயவுசெய்து காத்திருங்கள்." } },
      { id: "dont-understand", icon: "❓", text: { en: "I do not understand.", ta: "எனக்குப் புரியவில்லை." } },
      { id: "tell-you", icon: "💬", text: { en: "I want to tell you something.", ta: "நான் உங்களிடம் ஒன்று சொல்ல வேண்டும்." } },
    ],
  },
]);

export const MY_PHRASES_ID = "mine";

/** Text in the chosen language, falling back to English. */
export function localized(value, language) {
  if (typeof value === "string") return value;
  return value?.[language] || value?.en || "";
}
