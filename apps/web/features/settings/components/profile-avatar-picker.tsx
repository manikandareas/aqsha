"use client";

import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { CameraIcon, Loader2Icon } from "lucide-react";
import { api } from "@aqsha/convex/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { getInitials } from "../lib/settings-format";

const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const maxBytes = 5 * 1024 * 1024;

export function ProfileAvatarPicker({
  name,
  email,
  image,
}: {
  name: string;
  email: string;
  image: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const generateUploadUrl = useMutation(api.auth.generateAvatarUploadUrl);
  const setAvatarFromStorage = useMutation(api.auth.setAvatarFromStorage);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickFile = () => {
    if (uploading) return;
    inputRef.current?.click();
  };

  const onFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(null);

    if (!acceptedTypes.has(file.type)) {
      setError("Pilih file JPG, PNG, WebP, atau GIF.");
      return;
    }

    if (file.size > maxBytes) {
      setError("Ukuran file maksimal 5 MB.");
      return;
    }

    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl({});
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!response.ok) {
        setError("Upload gagal. Coba lagi.");
        setUploading(false);
        return;
      }

      const body = (await response.json()) as { storageId?: string };
      if (!body.storageId) {
        setError("ID penyimpanan tidak tersedia.");
        setUploading(false);
        return;
      }

      await setAvatarFromStorage({ storageId: body.storageId as never });
      setUploading(false);
    } catch (uploadError) {
      const message =
        uploadError instanceof Error ? uploadError.message : "Gagal memperbarui avatar.";
      setError(message);
      setUploading(false);
    }
  };

  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={pickFile}
        disabled={uploading}
        aria-label="Ganti foto profil"
        className={cn(
          "group relative size-14 shrink-0 rounded-full outline-none transition-[transform,box-shadow] duration-150 ease-out",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          uploading ? "cursor-wait" : "cursor-pointer hover:scale-[1.02]",
        )}
      >
        <Avatar className="size-14 rounded-full ring-1 ring-border/60">
          {image ? <AvatarImage src={image} alt={name} /> : null}
          <AvatarFallback className="bg-sky-soft text-base font-semibold text-sky-foreground">
            {getInitials(name, email)}
          </AvatarFallback>
        </Avatar>

        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center rounded-full bg-foreground/55 text-[11px] font-medium text-background transition-opacity duration-150",
            uploading ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
          )}
        >
          {uploading ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <span className="flex flex-col items-center gap-0.5">
              <CameraIcon className="size-3.5" />
              <span>Ganti foto</span>
            </span>
          )}
        </span>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          onChange={onFileChange}
        />
      </button>

      {error ? <p className="text-[12px] text-coral-foreground">{error}</p> : null}
    </div>
  );
}
