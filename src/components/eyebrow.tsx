export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
      {children}
    </p>
  );
}
