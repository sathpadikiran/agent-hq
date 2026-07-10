import { useState } from "react";
import { ChevronRight, Loader2, MapPin, Search, Sparkles, Target, Check, ArrowLeft, Briefcase, Users } from "lucide-react";
import Modal, { FormField, PrimaryButton, TextArea, TextInput } from "./Modal";
import { call } from "@/lib/api";

type LeadSource = "apollo" | "google_maps";

type ApolloQuery = {
  mode: "apollo";
  person_titles: string[];
  person_locations: string[];
  organization_num_employees_ranges: string[];
  q_organization_keyword_tags: string[];
  per_page: number;
};
type GoogleMapsQuery = { mode: "google_maps"; location: string; searchTerms: string[]; maxResults: number };
type StructuredQuery = ApolloQuery | GoogleMapsQuery;

type Step = "input" | "preview";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated?: (campaign: { id: string; name: string }) => void;
};

const EXAMPLES: Record<LeadSource, string> = {
  apollo:
    "Head of Customer Experience at DTC Shopify brands in the US, 11–200 employees. Also VP Customer Support and Director of CX.",
  google_maps:
    "Personal injury law firms in Miami, FL with at least 4-star ratings. Also include family lawyers and estate planning attorneys in the greater Miami area.",
};

export default function OutreachWizard({ open, onClose, onCreated }: Props) {
  const [step, setStep] = useState<Step>("input");
  const [source, setSource] = useState<LeadSource>("apollo");
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [maxResults, setMaxResults] = useState(25);
  const [description, setDescription] = useState("");
  const [preview, setPreview] = useState<StructuredQuery | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStep("input");
    setSource("apollo");
    setName("");
    setQuery("");
    setMaxResults(25);
    setDescription("");
    setPreview(null);
    setError(null);
  }

  function close() {
    reset();
    onClose();
  }

  async function runPreview() {
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await call<StructuredQuery>("outreach.preview", {
        query: query.trim(),
        max_results: maxResults,
        source,
      });
      setPreview(result);
      setStep("preview");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Preview failed";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function createCampaign() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const label =
        preview.mode === "apollo"
          ? preview.person_titles[0] ?? "Apollo"
          : preview.location;
      const campaign = await call<{ id: string; name: string }>("outreach.campaign.create", {
        name: name.trim() || `Campaign · ${label}`,
        query: query.trim(),
        structured_query: preview,
        source,
        description: description.trim(),
      });
      onCreated?.(campaign);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={step === "input" ? "Describe your target market" : "Review targeting"}
      description={
        step === "input"
          ? "Natural language in. Structured targeting out. Gemini turns your one-liner into filters for the lead engine you pick."
          : source === "apollo"
          ? "Gemini turned your description into Apollo People Search filters. Review, then create the campaign."
          : "Gemini turned your description into a location plus search terms. Edit the query or create the campaign."
      }
      maxWidth="max-w-2xl"
    >
      {step === "input" && (
        <div className="space-y-4">
          {/* Lead-source picker — Apollo (people + verified email) vs Google Maps (local businesses) */}
          <div>
            <div className="text-xs uppercase tracking-widest text-white/80 font-display font-bold mb-2">Lead source</div>
            <div className="grid grid-cols-2 gap-2">
              {([
                {
                  value: "apollo" as const,
                  icon: <Briefcase size={15} />,
                  title: "Apollo People Search",
                  desc: "The right decision-maker by title + their verified email.",
                },
                {
                  value: "google_maps" as const,
                  icon: <MapPin size={15} />,
                  title: "Google Maps",
                  desc: "Local businesses by type + location. Needs Apify key.",
                },
              ]).map((opt) => {
                const active = source === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSource(opt.value)}
                    className={`text-left rounded-xl border px-3 py-2.5 transition ${
                      active ? "bg-primary/15 border-primary/50 shadow-glow" : "bg-white/[0.02] border-white/10 hover:border-white/25"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={active ? "text-primary" : "text-white/60"}>{opt.icon}</span>
                      <span className={`font-display font-bold text-sm ${active ? "text-white" : "text-white/85"}`}>{opt.title}</span>
                      {active && <Check size={13} className="text-primary ml-auto" />}
                    </div>
                    <p className={`text-[11px] ${active ? "text-white/75" : "text-white/50"}`}>{opt.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <FormField label="Campaign name" hint="For your own reference. Auto-derived if blank.">
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={source === "apollo" ? "DTC CX Leaders · Q3" : "Miami Law Firms · Q2"}
              autoFocus
            />
          </FormField>

          <FormField
            label="Who are you targeting?"
            required
            hint={
              source === "apollo"
                ? "Describe the person (title), their company type, size, and location."
                : "Describe the business type, location, and any filters (ratings, size, niche)."
            }
          >
            <TextArea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={EXAMPLES[source]}
              rows={5}
              spellCheck
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Max results" hint={source === "apollo" ? "People to fetch. Clamped to 1–100." : "Clamped to 10–200."}>
              <TextInput
                type="number"
                min={source === "apollo" ? 1 : 10}
                max={source === "apollo" ? 100 : 200}
                value={maxResults}
                onChange={(e) => {
                  const lo = source === "apollo" ? 1 : 10;
                  const hi = source === "apollo" ? 100 : 200;
                  setMaxResults(Math.max(lo, Math.min(hi, Number(e.target.value))));
                }}
              />
            </FormField>
            <FormField label="Description (optional)" hint="Internal note.">
              <TextInput
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Outbound pilot for Q2"
              />
            </FormField>
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/15 border border-red-500/40 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <PrimaryButton onClick={runPreview} disabled={!query.trim() || busy} loading={busy}>
              {busy ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Analysing with Gemini
                </>
              ) : (
                <>
                  <Sparkles size={14} /> Preview search strategy
                </>
              )}
            </PrimaryButton>
            <button
              onClick={close}
              className="px-4 py-3 text-sm text-white/60 hover:text-white transition font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {step === "preview" && preview && preview.mode === "apollo" && (
        <div className="space-y-4">
          <PreviewCard icon={<Briefcase size={14} className="text-primary" />} title={`Job titles (${preview.person_titles.length})`}>
            <ul className="space-y-2">
              {preview.person_titles.map((t, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-white/85">
                  <ChevronRight size={14} className="text-primary shrink-0 mt-0.5" />
                  <span className="font-mono">{t}</span>
                </li>
              ))}
            </ul>
          </PreviewCard>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <PreviewCard icon={<MapPin size={14} className="text-purple" />} title="Person locations">
              <ChipList items={preview.person_locations} empty="Any location" />
            </PreviewCard>
            <PreviewCard icon={<Users size={14} className="text-accent" />} title="Company size">
              <ChipList items={preview.organization_num_employees_ranges.map((r) => `${r.replace(",", "–")} employees`)} empty="Any size" />
            </PreviewCard>
          </div>

          {preview.q_organization_keyword_tags.length > 0 && (
            <PreviewCard icon={<Search size={14} className="text-primary" />} title="Company keywords">
              <ChipList items={preview.q_organization_keyword_tags} empty="—" />
            </PreviewCard>
          )}

          <div className="rounded-xl border border-white/10 bg-black/30 p-4 flex items-center gap-3">
            <Target size={14} className="text-accent" />
            <span className="text-xs text-white/70">
              Up to <span className="text-white font-bold">{preview.per_page}</span> people · emails revealed on demand (1 Apollo credit each) after the search.
            </span>
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/15 border border-red-500/40 px-4 py-3 text-sm text-red-200">{error}</div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => {
                setStep("input");
                setError(null);
              }}
              className="flex items-center gap-2 px-4 py-3 text-sm rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/85 font-semibold transition"
            >
              <ArrowLeft size={14} /> Edit query
            </button>
            <PrimaryButton onClick={createCampaign} disabled={busy} loading={busy}>
              <Check size={14} /> Create campaign
            </PrimaryButton>
          </div>
        </div>
      )}

      {step === "preview" && preview && preview.mode === "google_maps" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-black/30 p-4">
            <div className="flex items-center gap-2 mb-2">
              <MapPin size={14} className="text-primary" />
              <span className="text-xs font-display tracking-widest uppercase text-white/60 font-bold">Location</span>
            </div>
            <p className="text-lg font-medium text-white">{preview.location}</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/30 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Search size={14} className="text-purple" />
              <span className="text-xs font-display tracking-widest uppercase text-white/60 font-bold">
                Search queries ({preview.searchTerms.length})
              </span>
            </div>
            <ul className="space-y-2">
              {preview.searchTerms.map((term, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-white/85">
                  <ChevronRight size={14} className="text-primary shrink-0 mt-0.5" />
                  <span className="font-mono">{term}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/30 p-4 flex items-center gap-3">
            <Target size={14} className="text-accent" />
            <span className="text-xs text-white/70">
              Up to <span className="text-white font-bold">{preview.maxResults}</span> leads · Apify Google Maps scraper
            </span>
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/15 border border-red-500/40 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => {
                setStep("input");
                setError(null);
              }}
              className="flex items-center gap-2 px-4 py-3 text-sm rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/85 font-semibold transition"
            >
              <ArrowLeft size={14} /> Edit query
            </button>
            <PrimaryButton onClick={createCampaign} disabled={busy} loading={busy}>
              <Check size={14} /> Create campaign
            </PrimaryButton>
          </div>
        </div>
      )}
    </Modal>
  );
}

function PreviewCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-4">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <span className="text-xs font-display tracking-widest uppercase text-white/60 font-bold">{title}</span>
      </div>
      {children}
    </div>
  );
}

function ChipList({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <span className="text-sm text-white/40 italic">{empty}</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it, i) => (
        <span key={i} className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-white/80 text-[12px] font-mono">
          {it}
        </span>
      ))}
    </div>
  );
}
