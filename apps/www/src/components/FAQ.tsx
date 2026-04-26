import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const FAQ = () => {
  const faqs = [
    {
      question: "Bagaimana cara siswa join ke quiz?",
      answer: "Siswa cukup masukkan kode akses 6-digit yang kamu share (misal: \"MTH123\"). Tidak perlu registrasi atau login—langsung bisa mulai mengerjakan. Super simpel!"
    },
    {
      question: "Apakah saya bisa edit soal yang di-generate AI?",
      answer: "Tentu saja! Setelah AI generate soal, kamu punya kontrol penuh untuk: Edit pertanyaan & opsi jawaban, Reorder soal (drag-and-drop), Hapus soal yang tidak relevan, Tambah soal manual, dan Edit explanation/feedback."
    },
    {
      question: "Bagaimana kalau siswa salah masukin kode?",
      answer: "Kalau kode salah atau tidak ditemukan, siswa akan dapat error message yang jelas. Mereka bisa coba lagi dengan kode yang benar. Tidak ada penalty atau lockout."
    },
    {
      question: "Apakah jawaban siswa auto-save?",
      answer: "Ya! Setiap jawaban tersimpan otomatis ke database. Kalau koneksi putus atau browser di-refresh, progress siswa tetap aman. Mereka bisa lanjut dari soal terakhir yang dikerjakan."
    },
    {
      question: "File apa saja yang bisa di-upload?",
      answer: "Aqsha mendukung: PDF files (hingga 50MB) - dengan OCR untuk ekstrak teks, Web URLs - artikel, dokumentasi, Wikipedia, dll., dan Raw text - copy-paste langsung dari mana saja. Kami validasi file dengan magic byte untuk keamanan."
    },
    {
      question: "Berapa banyak soal yang bisa di-generate?",
      answer: "Tergantung panjang materi yang di-upload. Untuk 1 PDF berisi 10 halaman, AI biasanya bisa generate 15-25 soal berkualitas. Kamu bisa request jumlah soal tertentu (misal: \"buatkan 20 soal\") dan AI akan adjust."
    },
    {
      question: "Apakah bisa set time limit untuk quiz?",
      answer: "Ya! Saat create session, kamu bisa set: Time limit per quiz (misal: 60 menit), Start & end time scheduling, Max attempts (unlimited atau batasi), dan Deadline untuk submit. Semuanya opsional—kamu yang kontrol."
    },
    {
      question: "Bagaimana cara lihat hasil siswa?",
      answer: "Kamu bisa lihat hasil dari: Real-time monitoring dashboard - lihat siapa yang sedang mengerjakan, Individual participant detail - klik nama siswa untuk lihat jawaban lengkap, Session analytics - score distribution, completion rate, dll., dan Export data (coming soon) - download hasil ke CSV/Excel."
    },
    {
      question: "Apakah data siswa aman?",
      answer: "Sangat aman! Kami menggunakan: Clerk authentication (enterprise-grade), HTTPS encryption untuk semua data, Convex database dengan automatic backups, Tidak menyimpan informasi sensitif (no email required untuk siswa), dan Tidak share data ke third-party."
    },
    {
      question: "Berapa lama proses generate soal?",
      answer: "Tergantung ukuran materi: PDF 5-10 halaman: ~2-3 menit, Web URL artikel: ~1-2 menit, Raw text (medium): ~1-2 menit. Prosesnya di-track dengan progress bar, jadi kamu bisa lihat step mana yang sedang berjalan."
    },
  ];

  return (
    <section id="faq" className="py-12 md:py-20 lg:py-24 px-4 bg-background">
      <div className="container mx-auto max-w-3xl">
        <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-center mb-4 md:mb-6 text-foreground px-4">
          Pertanyaan yang Sering Diajukan
        </h2>
        <p className="text-center text-sm md:text-base text-muted-foreground mb-8 md:mb-12 px-4">
          Semua yang perlu kamu tahu tentang Aqsha
        </p>

        <Accordion type="single" collapsible className="space-y-3 md:space-y-4">
          {faqs.map((faq, index) => (
            <AccordionItem
              key={index}
              value={`item-${index}`}
              className="border border-border/50 rounded-lg px-4 md:px-6 bg-card/30"
            >
              <AccordionTrigger className="text-left text-sm md:text-base text-foreground hover:no-underline py-4">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-sm md:text-base text-muted-foreground leading-relaxed">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
};
