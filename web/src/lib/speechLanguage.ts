/** Lingua parlato / risposte AI (UI admin e chrome robot restano in italiano). */

export const SPEECH_LANGUAGES = [
  { code: "it", label: "Italiano", locale: "it-IT", bcp47: "it-IT" },
  { code: "en", label: "English", locale: "en-US", bcp47: "en-US" },
  { code: "de", label: "Deutsch", locale: "de-DE", bcp47: "de-DE" },
  { code: "fr", label: "Français", locale: "fr-FR", bcp47: "fr-FR" },
  { code: "es", label: "Español", locale: "es-ES", bcp47: "es-ES" },
] as const;

export type SpeechLanguageCode = (typeof SPEECH_LANGUAGES)[number]["code"];

export function normalizeSpeechLanguage(
  raw: string | null | undefined
): SpeechLanguageCode {
  const c = (raw ?? "it").trim().toLowerCase().slice(0, 2);
  const hit = SPEECH_LANGUAGES.find((l) => l.code === c);
  return hit?.code ?? "it";
}

export function speechLanguageMeta(code: string | null | undefined) {
  const n = normalizeSpeechLanguage(code);
  return SPEECH_LANGUAGES.find((l) => l.code === n)!;
}

export type SpeechPhrasePack = {
  welcome: string;
  howCanIHelp: string;
  goingTo: string;
  arrived: string;
  navigationFailed: string;
  followStarted: string;
  followLost: string;
  personNotFound: string;
  goodbye: string;
  configUpdated: string;
  configUpdateFailed: string;
  wakeHintLabel: string;
  wakeHint: string;
  wakeGreeting: string;
  checkInSpeak: string;
  callOperatorSpeak: string;
  moduleDisabledSpeak: string;
  speechModuleOff: string;
  openaiMissing: string;
  voiceMemosOpen: string;
  voiceMemoSaved: string;
  voiceMemoSavedEmpty: string;
};

const PACKS: Record<SpeechLanguageCode, SpeechPhrasePack> = {
  it: {
    welcome: "Benvenuto",
    howCanIHelp: "Come posso aiutarti?",
    goingTo: "Vado a {place}",
    arrived: "Siamo arrivati a {place}",
    navigationFailed: "Non riesco ad arrivare a {place}",
    followStarted: "Ok, ti seguo",
    followLost: "Ti ho perso di vista",
    personNotFound: "Non vedo nessuno da seguire",
    goodbye: "A presto!",
    configUpdated: "Configurazione aggiornata",
    configUpdateFailed: "Aggiornamento configurazione non riuscito",
    wakeHintLabel: "Per parlare",
    wakeHint: "Dimmi ehi Bob per parlare con me",
    wakeGreeting: "Ciao, sì sono io Bob. Come posso aiutarti?",
    checkInSpeak: "Perfetto, ho avvisato che sei arrivato",
    callOperatorSpeak: "Sto chiamando un operatore",
    moduleDisabledSpeak: "Quel servizio non è attivo su questo robot.",
    speechModuleOff: "Il modulo voce non è attivo.",
    openaiMissing:
      "La voce intelligente non è configurata. Imposta OPENAI_API_KEY sul server.",
    voiceMemosOpen:
      "Apro i memo vocali. Tocca Inizia a registrare quando sei pronto.",
    voiceMemoSaved: "Memo salvato e trascritto.",
    voiceMemoSavedEmpty: "Memo salvato.",
  },
  en: {
    welcome: "Welcome",
    howCanIHelp: "How can I help you?",
    goingTo: "Going to {place}",
    arrived: "We have arrived at {place}",
    navigationFailed: "I can't reach {place}",
    followStarted: "Okay, I'll follow you",
    followLost: "I lost sight of you",
    personNotFound: "I don't see anyone to follow",
    goodbye: "See you soon!",
    configUpdated: "Configuration updated",
    configUpdateFailed: "Configuration update failed",
    wakeHintLabel: "To talk",
    wakeHint: "Say hey Bob to talk to me",
    wakeGreeting: "Hi, yes it's me, Bob. How can I help you?",
    checkInSpeak: "Perfect, I've let them know you've arrived",
    callOperatorSpeak: "I'm calling an operator",
    moduleDisabledSpeak: "That service is not enabled on this robot.",
    speechModuleOff: "The voice module is not active.",
    openaiMissing:
      "Smart voice is not configured. Set OPENAI_API_KEY on the server.",
    voiceMemosOpen:
      "Opening voice memos. Tap Start recording when you're ready.",
    voiceMemoSaved: "Memo saved and transcribed.",
    voiceMemoSavedEmpty: "Memo saved.",
  },
  de: {
    welcome: "Willkommen",
    howCanIHelp: "Wie kann ich Ihnen helfen?",
    goingTo: "Ich gehe zu {place}",
    arrived: "Wir sind bei {place} angekommen",
    navigationFailed: "Ich kann {place} nicht erreichen",
    followStarted: "Okay, ich folge Ihnen",
    followLost: "Ich habe Sie aus den Augen verloren",
    personNotFound: "Ich sehe niemanden zum Folgen",
    goodbye: "Bis bald!",
    configUpdated: "Konfiguration aktualisiert",
    configUpdateFailed: "Konfigurationsupdate fehlgeschlagen",
    wakeHintLabel: "Zum Sprechen",
    wakeHint: "Sag hey Bob, um mit mir zu sprechen",
    wakeGreeting: "Hallo, ja ich bin Bob. Wie kann ich helfen?",
    checkInSpeak: "Perfekt, ich habe Bescheid gegeben, dass Sie da sind",
    callOperatorSpeak: "Ich rufe einen Mitarbeiter",
    moduleDisabledSpeak: "Dieser Dienst ist auf diesem Roboter nicht aktiv.",
    speechModuleOff: "Das Sprachmodul ist nicht aktiv.",
    openaiMissing:
      "Intelligente Sprache ist nicht konfiguriert. OPENAI_API_KEY fehlt.",
    voiceMemosOpen:
      "Ich öffne Sprachnotizen. Tippen Sie auf Aufnehmen, wenn Sie bereit sind.",
    voiceMemoSaved: "Notiz gespeichert und transkribiert.",
    voiceMemoSavedEmpty: "Notiz gespeichert.",
  },
  fr: {
    welcome: "Bienvenue",
    howCanIHelp: "Comment puis-je vous aider ?",
    goingTo: "Je vais à {place}",
    arrived: "Nous sommes arrivés à {place}",
    navigationFailed: "Je n'arrive pas à {place}",
    followStarted: "D'accord, je vous suis",
    followLost: "Je vous ai perdu de vue",
    personNotFound: "Je ne vois personne à suivre",
    goodbye: "À bientôt !",
    configUpdated: "Configuration mise à jour",
    configUpdateFailed: "Échec de la mise à jour",
    wakeHintLabel: "Pour parler",
    wakeHint: "Dites hey Bob pour me parler",
    wakeGreeting: "Bonjour, oui c'est moi Bob. Comment puis-je aider ?",
    checkInSpeak: "Parfait, j'ai signalé votre arrivée",
    callOperatorSpeak: "J'appelle un opérateur",
    moduleDisabledSpeak: "Ce service n'est pas activé sur ce robot.",
    speechModuleOff: "Le module vocal n'est pas actif.",
    openaiMissing:
      "La voix intelligente n'est pas configurée. Définissez OPENAI_API_KEY.",
    voiceMemosOpen:
      "J'ouvre les mémos vocaux. Appuyez sur Enregistrer quand vous êtes prêt.",
    voiceMemoSaved: "Mémo enregistré et transcrit.",
    voiceMemoSavedEmpty: "Mémo enregistré.",
  },
  es: {
    welcome: "Bienvenido",
    howCanIHelp: "¿Cómo puedo ayudarte?",
    goingTo: "Voy a {place}",
    arrived: "Hemos llegado a {place}",
    navigationFailed: "No puedo llegar a {place}",
    followStarted: "Vale, te sigo",
    followLost: "Te he perdido de vista",
    personNotFound: "No veo a nadie a quien seguir",
    goodbye: "¡Hasta pronto!",
    configUpdated: "Configuración actualizada",
    configUpdateFailed: "Error al actualizar la configuración",
    wakeHintLabel: "Para hablar",
    wakeHint: "Di hey Bob para hablar conmigo",
    wakeGreeting: "Hola, sí soy Bob. ¿Cómo puedo ayudarte?",
    checkInSpeak: "Perfecto, he avisado de que has llegado",
    callOperatorSpeak: "Estoy llamando a un operador",
    moduleDisabledSpeak: "Ese servicio no está activo en este robot.",
    speechModuleOff: "El módulo de voz no está activo.",
    openaiMissing:
      "La voz inteligente no está configurada. Define OPENAI_API_KEY.",
    voiceMemosOpen:
      "Abro los memos de voz. Toca Empezar a grabar cuando estés listo.",
    voiceMemoSaved: "Memo guardado y transcrito.",
    voiceMemoSavedEmpty: "Memo guardado.",
  },
};

export function speechPhrases(code: string | null | undefined): SpeechPhrasePack {
  return PACKS[normalizeSpeechLanguage(code)];
}

export function languageInstructionName(code: string | null | undefined): string {
  switch (normalizeSpeechLanguage(code)) {
    case "en":
      return "English";
    case "de":
      return "German";
    case "fr":
      return "French";
    case "es":
      return "Spanish";
    default:
      return "Italian";
  }
}

/** Locale BCP-47 per robot.locale / formattazione data. */
export function speechLocale(code: string | null | undefined): string {
  return speechLanguageMeta(code).bcp47;
}

/** Frase di fallback se l'AI non risponde. */
export function speechAiUnavailable(code: string | null | undefined): string {
  switch (normalizeSpeechLanguage(code)) {
    case "en":
      return "I can't reply right now. Please try again in a moment.";
    case "de":
      return "Ich kann gerade nicht antworten. Bitte versuchen Sie es gleich noch einmal.";
    case "fr":
      return "Je ne peux pas répondre pour le moment. Réessayez dans un instant.";
    case "es":
      return "No puedo responder ahora. Inténtalo de nuevo en un momento.";
    default:
      return "Non riesco a rispondere adesso. Riprova tra un momento.";
  }
}
