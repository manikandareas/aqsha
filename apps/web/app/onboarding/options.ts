// Label onboarding (Bahasa Indonesia, sentence case). `id` = kontrak dengan
// backend (@aqsha/services onboarding/options) — jaga tetap sinkron.

export type OnboardingOption = { id: string; label: string };

export const BACKGROUND_OPTIONS: OnboardingOption[] = [
  { id: "pelajar", label: "Pelajar (SMA/sederajat)" },
  { id: "mahasiswa_s1", label: "Mahasiswa S1" },
  { id: "mahasiswa_s2", label: "Mahasiswa S2" },
  { id: "mahasiswa_s3", label: "Mahasiswa S3 / kandidat doktor" },
  { id: "peneliti", label: "Peneliti / akademisi" },
  { id: "dosen", label: "Dosen / pembimbing" },
  { id: "profesional", label: "Profesional" },
  { id: "lainnya", label: "Lainnya" },
];

export const INTEREST_OPTIONS: OnboardingOption[] = [
  { id: "ai_cs", label: "Kecerdasan buatan & ilmu komputer" },
  { id: "kesehatan", label: "Kedokteran & kesehatan" },
  { id: "biologi", label: "Biologi & ilmu hayati" },
  { id: "fisika", label: "Fisika" },
  { id: "kimia", label: "Kimia" },
  { id: "matematika", label: "Matematika & statistika" },
  { id: "teknik", label: "Teknik & rekayasa" },
  { id: "ekonomi", label: "Ekonomi & bisnis" },
  { id: "psikologi", label: "Psikologi" },
  { id: "sosial_politik", label: "Ilmu sosial & politik" },
  { id: "pendidikan", label: "Pendidikan" },
  { id: "lingkungan", label: "Lingkungan & iklim" },
  { id: "hukum", label: "Hukum" },
  { id: "neuroscience", label: "Ilmu saraf" },
  { id: "linguistik", label: "Linguistik & sastra" },
];

export const SOURCE_OPTIONS: OnboardingOption[] = [
  { id: "teman", label: "Teman / kolega" },
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "x", label: "X / Twitter" },
  { id: "youtube", label: "YouTube" },
  { id: "google", label: "Google / pencarian" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "kampus", label: "Dosen / kampus" },
];

export const SOURCE_OTHER: OnboardingOption = { id: "lainnya", label: "Lainnya" };

export const MIN_INTERESTS = 3;
