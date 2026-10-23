import { Uploader } from "@/components/Uploader";
import { EventHeader } from "@/components/EventHeader";
import { getEvent, getLimits } from "@/lib/event";

export const dynamic = "force-dynamic";

export default function Home() {
  const event = getEvent();
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <EventHeader {...event} />
      <div className="flex-1 px-4 py-6">
        <Uploader limits={getLimits()} />
      </div>
      <footer className="px-4 pb-6 text-center text-xs text-black/50">
        Yüklediğiniz fotoğraflar yalnızca çift ve misafirlerle paylaşılır.
      </footer>
    </main>
  );
}
