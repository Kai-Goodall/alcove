"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { IconPlusFill18 } from "nucleo-ui-fill-18";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/_components/ui/button";
import { Icon } from "@/_components/ui/icon";
import { Input } from "@/_components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/_components/ui/popover";
import { Typography } from "@/_components/ui/typography";

interface HeaderProps {
  onApartmentAdded: (apartmentId: Id<"apartments">) => void;
}

function Header({ onApartmentAdded }: HeaderProps) {
  return (
    <header className="flex items-center justify-between">
      <Typography variant="h1" className="text-foreground">
        Alcove
      </Typography>
      <AddApartmentControl onApartmentAdded={onApartmentAdded} />
    </header>
  );
}

interface AddApartmentControlProps {
  onApartmentAdded: (apartmentId: Id<"apartments">) => void;
}

function AddApartmentControl({ onApartmentAdded }: AddApartmentControlProps) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [jobId, setJobId] = useState<Id<"apartmentImportJobs"> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const completedJobRef = useRef<Id<"apartmentImportJobs"> | null>(null);
  const createJob = useMutation(api.apartmentImports.createFromUrl);
  const job = useQuery(
    api.apartmentImports.get,
    jobId ? { jobId } : "skip",
  );

  useEffect(() => {
    if (
      !job ||
      job.status !== "completed" ||
      !job.apartmentId ||
      completedJobRef.current === job._id
    ) {
      return;
    }

    completedJobRef.current = job._id;
    onApartmentAdded(job.apartmentId);
    setOpen(false);
  }, [job, onApartmentAdded]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    completedJobRef.current = null;

    try {
      const nextJobId = await createJob({ url });
      setJobId(nextJobId);
      setUrl("");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not start import.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const statusMessage =
    error ??
    job?.error ??
    job?.statusMessage ??
    (jobId ? "Starting import." : null);
  const isWorking =
    submitting ||
    (job !== undefined &&
      job !== null &&
      !["completed", "failed"].includes(job.status));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button aria-label="Add apartment">
          <Icon glyph={IconPlusFill18} size={14} />
          Add
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] rounded-[28px] p-3">
        <form className="flex flex-col gap-2" onSubmit={handleSubmit}>
          <Input
            autoFocus
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              if (error) setError(null);
            }}
            placeholder="Apartment link"
            type="url"
            inputMode="url"
            invalid={Boolean(error)}
            disabled={isWorking}
          />
          <div className="flex items-center justify-between gap-3">
            <Typography
              variant="caption"
              className="min-h-4 flex-1 truncate text-muted-foreground"
            >
              {statusMessage}
            </Typography>
            <Button type="submit" disabled={isWorking || url.trim().length === 0}>
              Run
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

export { Header };
