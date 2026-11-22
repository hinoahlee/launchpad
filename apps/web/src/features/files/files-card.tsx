import { type FileItem, MAX_FILE_BYTES } from "@launchpad/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Trash2, Upload } from "lucide-react";
import { useRef } from "react";
import { Button } from "#components/ui/button.tsx";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#components/ui/card.tsx";
import { ApiError } from "#lib/api.ts";
import {
	deleteFile,
	downloadUrl,
	filesQuery,
	UploadError,
	uploadFile,
} from "./api.ts";

const date = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const megabytes = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function uploadErrorMessage(error: Error): string {
	if (error instanceof UploadError && error.reason === "too_large") {
		return `That file is too big. The limit is ${megabytes(MAX_FILE_BYTES)}.`;
	}
	if (error instanceof ApiError && error.code === "storage_quota_exceeded") {
		return "You're out of space. Delete some files, then try again.";
	}
	return "That file couldn't be uploaded. Please try again.";
}

// Upload, download and delete your files: your organization's (12.2; each user has exactly one, decision 010).
// The bytes go between the browser and the bucket; the API only hands out short-lived signed URLs
// (features/files in the API).
export function FilesCard({ organizationId }: { organizationId: string }) {
	const queryClient = useQueryClient();
	const query = filesQuery(organizationId);
	const files = useQuery(query);
	const input = useRef<HTMLInputElement>(null);
	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: query.queryKey });

	const upload = useMutation({
		mutationFn: (file: File) => uploadFile(organizationId, file),
		onSuccess: refresh,
	});
	const download = useMutation({
		mutationFn: (id: string) => downloadUrl(organizationId, id),
		// A navigation, not a fetch: the bucket answers with Content-Disposition: attachment, so the browser saves
		// the file and stays on this page.
		onSuccess: ({ url }) => window.location.assign(url),
	});
	const remove = useMutation({
		mutationFn: (id: string) => deleteFile(organizationId, id),
		onSuccess: refresh,
	});

	// Uploads are off on this server (no bucket configured): no card at all.
	if (files.data === null) return null;

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<h2>Files</h2>
				</CardTitle>
				<CardDescription>
					Files you've uploaded. Only you can see them. Up to{" "}
					{megabytes(MAX_FILE_BYTES)} each.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div>
					<input
						ref={input}
						type="file"
						className="sr-only"
						aria-label="Choose a file to upload"
						tabIndex={-1}
						onChange={(event) => {
							const file = event.target.files?.[0];
							// Cleared, so choosing the same file again fires onChange again.
							event.target.value = "";
							if (file) upload.mutate(file);
						}}
					/>
					<Button
						variant="outline"
						disabled={upload.isPending}
						onClick={() => input.current?.click()}
					>
						<Upload /> {upload.isPending ? "Uploading…" : "Upload a file"}
					</Button>
					{upload.isError && (
						<p className="pt-2 text-sm text-destructive">
							{uploadErrorMessage(upload.error)}
						</p>
					)}
				</div>

				{files.isPending && (
					<p className="text-sm text-muted-foreground">Loading…</p>
				)}
				{files.isError && (
					<p className="text-sm text-destructive">
						We couldn't load your files. Refresh to try again.
					</p>
				)}
				{files.data?.files.length === 0 && (
					<p className="text-sm text-muted-foreground">No files yet.</p>
				)}
				{files.data && files.data.files.length > 0 && (
					<ul className="flex flex-col divide-y">
						{files.data.files.map((file) => (
							<FileRow
								key={file.id}
								file={file}
								busy={
									(download.isPending && download.variables === file.id) ||
									(remove.isPending && remove.variables === file.id)
								}
								onDownload={() => download.mutate(file.id)}
								onDelete={() => remove.mutate(file.id)}
							/>
						))}
					</ul>
				)}
				{(download.isError || remove.isError) && (
					<p className="text-sm text-destructive">
						Something went wrong. Please try again.
					</p>
				)}
			</CardContent>
		</Card>
	);
}

function FileRow({
	file,
	busy,
	onDownload,
	onDelete,
}: {
	file: FileItem;
	busy: boolean;
	onDownload: () => void;
	onDelete: () => void;
}) {
	return (
		<li className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
			<div className="flex min-w-0 flex-col gap-1">
				<p className="truncate font-medium">{file.fileName}</p>
				<p className="text-sm text-muted-foreground">
					{`${formatSize(file.sizeBytes)} · ${date.format(new Date(file.uploadedAt))}`}
				</p>
			</div>
			<div className="flex shrink-0 gap-2">
				<Button
					variant="outline"
					size="icon"
					disabled={busy}
					aria-label={`Download ${file.fileName}`}
					onClick={onDownload}
				>
					<Download />
				</Button>
				<Button
					variant="outline"
					size="icon"
					disabled={busy}
					aria-label={`Delete ${file.fileName}`}
					onClick={onDelete}
				>
					<Trash2 />
				</Button>
			</div>
		</li>
	);
}
