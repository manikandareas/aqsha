import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export default function UIPage() {
  return (
    <div className="min-h-screen py-12">
      <div className="container mx-auto max-w-[1200px] flex flex-col gap-12 px-4">
        {/* Header */}
        <div className="flex flex-col gap-4">
          <h1 className="font-heading text-5xl font-bold tracking-tight text-foreground">
            Design System
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl">
            A Notion-inspired component library. Warm neutrals, ultra-thin
            whisper borders, and a heavy focus on typography and negative space.
          </p>
        </div>

        <Separator />

        {/* Buttons & Badges */}
        <section className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h2 className="font-heading text-3xl font-bold tracking-tight">
              Buttons & Badges
            </h2>
            <p className="text-muted-foreground">
              Interactive elements using 4px and full-pill radiuses.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 bg-background p-6 rounded-[12px] border border-border shadow-sm">
            <Button>Primary CTA</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost Link</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="pill">Pill Variant</Button>
          </div>

          <div className="flex flex-wrap items-center gap-4 bg-background p-6 rounded-[12px] border border-border shadow-sm">
            <Badge>Default Badge</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="blue">Status Blue</Badge>
            <Badge variant="destructive">Error</Badge>
          </div>
        </section>

        {/* Inputs */}
        <section className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h2 className="font-heading text-3xl font-bold tracking-tight">
              Inputs & Forms
            </h2>
            <p className="text-muted-foreground">
              Form controls with subtle borders and clear focus rings.
            </p>
          </div>

          <div className="grid gap-8 bg-background p-8 rounded-[12px] border border-border shadow-sm md:grid-cols-2">
            <div className="flex flex-col gap-3">
              <Label htmlFor="email">Email address</Label>
              <Input id="email" type="email" placeholder="name@example.com" />
            </div>

            <div className="flex flex-col gap-3">
              <Label htmlFor="bio">Biography</Label>
              <Textarea
                id="bio"
                placeholder="Tell us a little about yourself..."
              />
            </div>

            <div className="flex flex-col gap-3">
              <Label>Theme Preference</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select theme..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Light (Warm)</SelectItem>
                  <SelectItem value="dark">Dark (Notion Dark)</SelectItem>
                  <SelectItem value="system">System Default</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        {/* Cards */}
        <section className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h2 className="font-heading text-3xl font-bold tracking-tight">
              Cards & Containers
            </h2>
            <p className="text-muted-foreground">
              Soft 4-layer shadows and whisper borders.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Notion-style Card</CardTitle>
                <CardDescription>With minimal visual noise.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-foreground/90">
                  The shadow system uses multiple layers with extremely low
                  individual opacity (0.01 to 0.05) that accumulate into soft,
                  natural-looking elevation.
                </p>
              </CardContent>
              <CardFooter className="flex justify-end gap-2">
                <Button variant="ghost">Cancel</Button>
                <Button>Save</Button>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Feature Block</CardTitle>
                <CardDescription>Showcasing important data.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="font-heading text-4xl font-bold tracking-tight">
                  $4,200
                </div>
                <p className="text-sm text-muted-foreground">
                  Average return on investment using this framework.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Overlays */}
        <section className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h2 className="font-heading text-3xl font-bold tracking-tight">
              Overlays
            </h2>
            <p className="text-muted-foreground">
              Deep 5-layer shadows for elements that float above the page.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 bg-background p-6 rounded-[12px] border border-border shadow-sm">
            <Dialog>
              <DialogTrigger
                render={<Button variant="outline">Open Dialog</Button>}
              >
                Open Dialog
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Are you absolutely sure?</DialogTitle>
                  <DialogDescription>
                    This action cannot be undone. This will permanently delete
                    your account and remove your data from our servers.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline">Cancel</Button>
                  <Button variant="destructive">Delete Account</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="outline">Open Menu</Button>}
              >
                Open Menu
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Profile</DropdownMenuItem>
                <DropdownMenuItem>Billing</DropdownMenuItem>
                <DropdownMenuItem>Team</DropdownMenuItem>
                <DropdownMenuItem>Subscription</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </section>
      </div>
    </div>
  );
}
