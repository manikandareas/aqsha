import { AppPageHeader } from "@/components/app-page-header";

export default function JournalsPage() {
  return (
    <>
      <AppPageHeader title="Journals" />
      <div className="flex flex-1 items-center justify-center px-4 py-10 text-sm text-muted-foreground">
        Select a journal or create a new one from the sidebar.
      </div>
    </>
  );
}
