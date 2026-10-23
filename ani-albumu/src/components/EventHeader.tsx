type Props = { title: string; date: string; cover: string; compact?: boolean };

export function EventHeader({ title, date, cover, compact }: Props) {
  return (
    <header className={`relative overflow-hidden ${compact ? "h-36" : "h-56 sm:h-72"}`}>
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element -- kapak env'den gelen herhangi bir URL olabilir
        <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-gul via-murdum to-[#2e1520]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
      <div className="relative flex h-full flex-col items-center justify-end px-4 pb-6 text-center text-white">
        <h1 className={`font-serif ${compact ? "text-2xl" : "text-3xl sm:text-4xl"} leading-tight drop-shadow`}>
          {title}
        </h1>
        {date && <p className="mt-1 text-sm tracking-widest uppercase opacity-90">{date}</p>}
      </div>
    </header>
  );
}
