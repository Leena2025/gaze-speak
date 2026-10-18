// Symbols for picture-based communication. Every symbol has a text label
// because emoji look different on each operating system. Tamil text should
// be checked by a native speaker before real use.

export const SYMBOL_CATEGORIES = Object.freeze([
  {
    id: "needs",
    label: { en: "Needs", ta: "தேவைகள்" },
    symbols: [
      { id: "food", emoji: "🍽️", label: { en: "Food", ta: "உணவு" }, phrase: { en: "I want food.", ta: "எனக்கு உணவு வேண்டும்." } },
      { id: "water", emoji: "💧", label: { en: "Water", ta: "தண்ணீர்" }, phrase: { en: "I want water.", ta: "எனக்குத் தண்ணீர் வேண்டும்." } },
      { id: "tea", emoji: "☕", label: { en: "Tea", ta: "டீ" }, phrase: { en: "I want tea.", ta: "எனக்கு டீ வேண்டும்." } },
      { id: "bathroom", emoji: "🚻", label: { en: "Bathroom", ta: "கழிவறை" }, phrase: { en: "I need the bathroom.", ta: "எனக்குக் கழிவறை போக வேண்டும்." } },
      { id: "rest", emoji: "🛏️", label: { en: "Rest", ta: "ஓய்வு" }, phrase: { en: "I want to rest.", ta: "நான் ஓய்வெடுக்க வேண்டும்." } },
      { id: "medicine", emoji: "💊", label: { en: "Medicine", ta: "மருந்து" }, phrase: { en: "I need my medicine.", ta: "எனக்கு என் மருந்து வேண்டும்." } },
      { id: "help", emoji: "🆘", label: { en: "Help", ta: "உதவி" }, phrase: { en: "I need help.", ta: "எனக்கு உதவி வேண்டும்." } },
      { id: "light", emoji: "💡", label: { en: "Light", ta: "விளக்கு" }, phrase: { en: "Please switch the light on or off.", ta: "தயவுசெய்து விளக்கைப் போடுங்கள் அல்லது அணையுங்கள்." } },
      { id: "fan", emoji: "🌀", label: { en: "Fan", ta: "மின்விசிறி" }, phrase: { en: "Please switch the fan on or off.", ta: "தயவுசெய்து மின்விசிறியைப் போடுங்கள் அல்லது அணையுங்கள்." } },
    ],
  },
  {
    id: "feelings",
    label: { en: "Feelings", ta: "உணர்வுகள்" },
    symbols: [
      { id: "happy", emoji: "😊", label: { en: "Happy", ta: "மகிழ்ச்சி" }, phrase: { en: "I am happy.", ta: "நான் மகிழ்ச்சியாக இருக்கிறேன்." } },
      { id: "sad", emoji: "😢", label: { en: "Sad", ta: "சோகம்" }, phrase: { en: "I am sad.", ta: "நான் சோகமாக இருக்கிறேன்." } },
      { id: "uncomfortable", emoji: "😣", label: { en: "Uncomfortable", ta: "சங்கடம்" }, phrase: { en: "I am uncomfortable.", ta: "எனக்குச் சங்கடமாக இருக்கிறது." } },
      { id: "pain", emoji: "🤕", label: { en: "Pain", ta: "வலி" }, phrase: { en: "I am in pain.", ta: "எனக்கு வலிக்கிறது." } },
      { id: "sleepy", emoji: "😴", label: { en: "Sleepy", ta: "தூக்கம்" }, phrase: { en: "I am sleepy.", ta: "எனக்குத் தூக்கம் வருகிறது." } },
      { id: "scared", emoji: "😨", label: { en: "Scared", ta: "பயம்" }, phrase: { en: "I am scared.", ta: "எனக்குப் பயமாக இருக்கிறது." } },
      { id: "upset", emoji: "😠", label: { en: "Upset", ta: "கோபம்" }, phrase: { en: "I am upset.", ta: "எனக்குக் கோபமாக இருக்கிறது." } },
      { id: "love", emoji: "❤️", label: { en: "Love", ta: "அன்பு" }, phrase: { en: "I love you.", ta: "நான் உங்களை நேசிக்கிறேன்." } },
    ],
  },
  {
    id: "people",
    label: { en: "People", ta: "மனிதர்கள்" },
    symbols: [
      { id: "family", emoji: "👨‍👩‍👦", label: { en: "Family", ta: "குடும்பம்" }, phrase: { en: "I want my family.", ta: "எனக்கு என் குடும்பத்தினர் வேண்டும்." } },
      { id: "call", emoji: "📞", label: { en: "Call someone", ta: "அழைப்பு" }, phrase: { en: "Please call someone.", ta: "தயவுசெய்து யாரையாவது அழையுங்கள்." } },
      { id: "doctor", emoji: "🧑‍⚕️", label: { en: "Doctor", ta: "மருத்துவர்" }, phrase: { en: "I need a doctor.", ta: "எனக்கு மருத்துவர் வேண்டும்." } },
      { id: "friend", emoji: "🧑‍🤝‍🧑", label: { en: "Friend", ta: "நண்பர்" }, phrase: { en: "I want to see my friend.", ta: "நான் என் நண்பரைப் பார்க்க வேண்டும்." } },
      { id: "come", emoji: "👋", label: { en: "Come here", ta: "இங்கே வாருங்கள்" }, phrase: { en: "Please come here.", ta: "தயவுசெய்து இங்கே வாருங்கள்." } },
    ],
  },
  {
    id: "activities",
    label: { en: "Activities", ta: "செயல்கள்" },
    symbols: [
      { id: "music", emoji: "🎵", label: { en: "Music", ta: "இசை" }, phrase: { en: "I want music.", ta: "எனக்கு இசை கேட்க வேண்டும்." } },
      { id: "tv", emoji: "📺", label: { en: "TV", ta: "டிவி" }, phrase: { en: "I want to watch TV.", ta: "நான் டிவி பார்க்க வேண்டும்." } },
      { id: "news", emoji: "📰", label: { en: "News", ta: "செய்தி" }, phrase: { en: "Please read me the news.", ta: "தயவுசெய்து எனக்குச் செய்தி படித்துக் காட்டுங்கள்." } },
      { id: "outside", emoji: "🌳", label: { en: "Go outside", ta: "வெளியே" }, phrase: { en: "I want to go outside.", ta: "நான் வெளியே போக வேண்டும்." } },
      { id: "pray", emoji: "🛐", label: { en: "Pray", ta: "பிரார்த்தனை" }, phrase: { en: "I want to pray.", ta: "நான் பிரார்த்தனை செய்ய வேண்டும்." } },
    ],
  },
  {
    id: "answers",
    label: { en: "Answers", ta: "பதில்கள்" },
    symbols: [
      { id: "yes", emoji: "👍", label: { en: "Yes", ta: "ஆம்" }, phrase: { en: "Yes.", ta: "ஆம்." } },
      { id: "no", emoji: "👎", label: { en: "No", ta: "இல்லை" }, phrase: { en: "No.", ta: "இல்லை." } },
      { id: "stop", emoji: "✋", label: { en: "Stop", ta: "நிறுத்து" }, phrase: { en: "Please stop.", ta: "தயவுசெய்து நிறுத்துங்கள்." } },
      { id: "thanks", emoji: "🙏", label: { en: "Thank you", ta: "நன்றி" }, phrase: { en: "Thank you.", ta: "நன்றி." } },
      { id: "dont-know", emoji: "🤷", label: { en: "Don't know", ta: "தெரியாது" }, phrase: { en: "I don't know.", ta: "எனக்குத் தெரியாது." } },
    ],
  },
]);

export const MY_SYMBOLS_ID = "mine";
