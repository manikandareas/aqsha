"use client";

import { useUser } from "@clerk/nextjs";

export type ViewerIdentity = {
  name: string | null;
  email: string | null;
  image: string | null;
};

type ClerkUser = ReturnType<typeof useUser>["user"];

export function useResolvedViewer<TViewer extends ViewerIdentity>(
  viewer: TViewer | undefined,
): TViewer | undefined {
  const { user: clerkUser } = useUser();
  if (!viewer) return undefined;

  return {
    ...viewer,
    name: viewer.name || getClerkDisplayName(clerkUser),
    email: viewer.email || clerkUser?.primaryEmailAddress?.emailAddress || null,
    image: viewer.image || clerkUser?.imageUrl || null,
  };
}

export function useViewerDisplay(
  viewer: ViewerIdentity | undefined,
  fallback: { name: string; email: string },
) {
  const { user: clerkUser } = useUser();
  const name = viewer?.name || getClerkDisplayName(clerkUser) || fallback.name;
  const email =
    viewer?.email || clerkUser?.primaryEmailAddress?.emailAddress || fallback.email;
  const image = viewer?.image || clerkUser?.imageUrl || null;

  return {
    name,
    email,
    image,
    initials: getViewerInitials(name, email, fallback.name),
  };
}

function getClerkDisplayName(clerkUser: ClerkUser) {
  return (
    clerkUser?.fullName ||
    [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") ||
    clerkUser?.username ||
    null
  );
}

function getViewerInitials(name: string, email: string, nameFallback: string) {
  const source = name === nameFallback ? email : name;
  return source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
