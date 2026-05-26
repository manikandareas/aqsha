import { renderActionEmail, sendTransactionalEmail } from "./email";

type EmailUser = {
  email: string;
};

export async function sendVerificationEmail({
  user,
  url,
}: {
  user: EmailUser;
  url: string;
}) {
  const rendered = renderActionEmail({
    title: "Verifikasi email Aqsha",
    intro: "Klik tombol di bawah untuk memverifikasi alamat email akun Aqsha kamu.",
    actionLabel: "Verifikasi email",
    actionUrl: url,
    outro: "Tautan ini berlaku terbatas. Abaikan email ini jika kamu tidak meminta verifikasi.",
  });
  await sendTransactionalEmail({
    to: user.email,
    subject: "Verifikasi email Aqsha",
    ...rendered,
  });
}

export async function sendResetPasswordEmail({
  user,
  url,
}: {
  user: EmailUser;
  url: string;
}) {
  const rendered = renderActionEmail({
    title: "Reset kata sandi Aqsha",
    intro: "Kami menerima permintaan reset kata sandi untuk akun Aqsha kamu.",
    actionLabel: "Reset kata sandi",
    actionUrl: url,
    outro: "Jika kamu tidak meminta reset, abaikan email ini.",
  });
  await sendTransactionalEmail({
    to: user.email,
    subject: "Reset kata sandi Aqsha",
    ...rendered,
  });
}

export async function sendChangeEmailConfirmation({
  user,
  newEmail,
  url,
}: {
  user: EmailUser;
  newEmail: string;
  url: string;
}) {
  const rendered = renderActionEmail({
    title: "Konfirmasi perubahan email Aqsha",
    intro: `Konfirmasi perubahan email akun Aqsha dari ${user.email} ke ${newEmail}.`,
    actionLabel: "Konfirmasi email baru",
    actionUrl: url,
    outro: "Abaikan email ini jika kamu tidak meminta perubahan alamat email.",
  });
  await sendTransactionalEmail({
    to: user.email,
    subject: "Konfirmasi perubahan email Aqsha",
    ...rendered,
  });
}

export async function sendDeleteAccountVerification({
  user,
  url,
}: {
  user: EmailUser;
  url: string;
}) {
  const rendered = renderActionEmail({
    title: "Konfirmasi hapus akun Aqsha",
    intro: "Klik tombol di bawah untuk menghapus permanen akun Aqsha dan data milik akun ini.",
    actionLabel: "Hapus akun",
    actionUrl: url,
    outro: "Abaikan email ini jika kamu tidak meminta penghapusan akun.",
  });
  await sendTransactionalEmail({
    to: user.email,
    subject: "Konfirmasi hapus akun Aqsha",
    ...rendered,
  });
}
