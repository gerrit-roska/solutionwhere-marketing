"use client";

// Video review player for HeyGen assets. Presigned URLs expire, so a dead
// link should fail soft with a label rather than a broken player.
export function ReviewVideo({ src }: { src: string }) {
  return (
    <video
      src={src}
      controls
      preload="metadata"
      className="h-full w-full rounded-l-lg object-cover"
    />
  );
}
