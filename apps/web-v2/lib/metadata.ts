import type { Metadata } from "next";

export const siteName = "Aqsha";

type PageMetadataInput = {
  title: string;
  description: string;
};

export function createPageMetadata({ title, description }: PageMetadataInput): Metadata {
  return {
    title,
    description,
  };
}
