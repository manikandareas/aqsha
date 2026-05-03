"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowUpRightIcon,
  FileTextIcon,
  LinkIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PlusIcon,
  StarOffIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  useCreateJournalMutation,
  useJournalsQuery,
} from "@/features/journal/lib/queries";
import { getEdenErrorMessage } from "@/lib/eden-error";
import { cn } from "@/lib/utils";

const createJournalSchema = z.object({
  title: z.string().trim().min(1, "Journal title is required."),
});

type CreateJournalFormValues = z.infer<typeof createJournalSchema>;

function getJournalErrorMessage(error: unknown): string {
  return getEdenErrorMessage(error, "Journal request failed. Try again.");
}

export function NavJournal() {
  const { isMobile } = useSidebar();
  const router = useRouter();
  const pathname = usePathname();
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const journalsQuery = useJournalsQuery();
  const createJournalMutation = useCreateJournalMutation();
  const journals = journalsQuery.data ?? [];
  const queryError = journalsQuery.error
    ? getJournalErrorMessage(journalsQuery.error)
    : null;
  const form = useForm<CreateJournalFormValues>({
    resolver: zodResolver(createJournalSchema),
    defaultValues: {
      title: "",
    },
  });

  async function handleCreate(values: CreateJournalFormValues): Promise<void> {
    setError(null);

    try {
      const journal = await createJournalMutation.mutateAsync({
        title: values.title,
      });
      form.reset();
      setIsDialogOpen(false);
      router.push(`/app/journals/${journal.id}`);
    } catch (cause) {
      setError(getJournalErrorMessage(cause));
    }
  }

  const title = useWatch({ control: form.control, name: "title" });
  const isCreating =
    form.formState.isSubmitting || createJournalMutation.isPending;
  const formError = form.formState.errors.title?.message ?? error;
  const displayedError = error ?? queryError;

  return (
    <SidebarGroup className="px-1 py-0.5 group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel className="h-7 px-2 text-[11px] font-semibold tracking-[0.06em] text-sidebar-foreground/60">
        <span>JOURNALS</span>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="ml-auto -mr-1 text-sidebar-foreground/55 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
              />
            }
          >
            <PlusIcon />
            <span className="sr-only">Create journal</span>
          </DialogTrigger>
          <DialogContent>
            <form
              onSubmit={form.handleSubmit(handleCreate)}
              className="contents"
            >
              <DialogHeader>
                <DialogTitle>Create journal</DialogTitle>
                <DialogDescription>
                  Add a title to start a blank journal.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-2">
                <Label htmlFor="journal-title">Title</Label>
                <Input
                  id="journal-title"
                  {...form.register("title", {
                    onChange: () => setError(null),
                  })}
                  placeholder="Untitled"
                  autoFocus
                  aria-invalid={Boolean(formError)}
                />
                {formError ? (
                  <p className="text-sm text-destructive">{formError}</p>
                ) : null}
              </div>
              <DialogFooter>
                <Button
                  type="submit"
                  disabled={isCreating || title.trim().length === 0}
                >
                  {isCreating ? <Loader2Icon className="animate-spin" /> : null}
                  Create
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </SidebarGroupLabel>
      <SidebarMenu className="gap-1">
        {journalsQuery.isLoading ? (
          <SidebarMenuItem>
            <SidebarMenuButton
              disabled
              className="h-9 rounded-lg text-[13px] text-sidebar-foreground/60"
            >
              <Loader2Icon className="animate-spin" />
              <span>Loading journals</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ) : null}
        {!journalsQuery.isLoading && displayedError ? (
          <SidebarMenuItem>
            <SidebarMenuButton
              disabled
              className="h-auto min-h-9 cursor-default rounded-lg text-sidebar-foreground/60"
            >
              <span className="text-[13px] leading-5">{displayedError}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ) : null}
        {!journalsQuery.isLoading && !displayedError && journals.length === 0 ? (
          <SidebarMenuItem>
            <SidebarMenuButton
              disabled
              className="h-9 cursor-default rounded-lg text-sidebar-foreground/60"
            >
              <FileTextIcon className="h-[14px] w-[14px] text-sidebar-foreground/55" />
              <span className="text-[13px]">No journals yet</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ) : null}
        {journals.map((item) => {
          const isActive = pathname === `/app/journals/${item.id}`;

          return (
            <SidebarMenuItem key={item.id}>
              <SidebarMenuButton
                isActive={isActive}
                render={
                  <Link href={`/app/journals/${item.id}`} title={item.title} />
                }
                className={cn(
                  "h-9 rounded-lg text-[13px] font-medium transition-colors",
                  "focus-visible:ring-sidebar-ring",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent"
                    : "text-sidebar-foreground/72 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
                )}
              >
                <FileTextIcon
                  className={cn(
                    "h-[14px] w-[14px] shrink-0",
                    isActive
                      ? "text-sidebar-foreground"
                      : "text-sidebar-foreground/62",
                  )}
                />
                <span className="truncate">{item.title}</span>
              </SidebarMenuButton>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <SidebarMenuAction
                      showOnHover
                      className="text-sidebar-foreground/55 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground aria-expanded:bg-sidebar-accent/70"
                    />
                  }
                >
                  <MoreHorizontalIcon />
                  <span className="sr-only">More</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-56 rounded-lg"
                  side={isMobile ? "bottom" : "right"}
                  align={isMobile ? "end" : "start"}
                >
                  <DropdownMenuGroup>
                    <DropdownMenuItem>
                      <StarOffIcon className="text-muted-foreground" />
                      <span>Remove from Journal</span>
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem>
                      <LinkIcon className="text-muted-foreground" />
                      <span>Copy Link</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <ArrowUpRightIcon className="text-muted-foreground" />
                      <a
                        href={`/app/journals/${item.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open in New Tab
                      </a>
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
