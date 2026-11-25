import Link from "next/link";
import { notFound } from "next/navigation";
import { PhysicalDeck, type PhysicalDeckPose } from "@/components/PhysicalDeck";
import styles from "@/components/PhysicalDeck.module.css";

const poses: { value: PhysicalDeckPose; title: string; description: string }[] = [
  { value: "wait", title: "01 · En espera", description: "Tapas juntas, abertura central y equipo listo para recibir un CD." },
  { value: "open", title: "02 · Carga abierta", description: "Tapas separadas, mecanismo y eje expuestos; el CD espera sobre el receptáculo." },
  { value: "docked", title: "03 · CD acoplado", description: "CD horizontal visible por la abertura; tapas juntas y frente legible." },
];

export default async function DeckPoses({ searchParams }: { searchParams: Promise<{ pose?: string }> }) {
  if (process.env.NEXT_PUBLIC_SPOTIFY_MOCK !== "1") notFound();
  const query = await searchParams;
  const pose = poses.find((item) => item.value === query.pose) ?? poses[0];
  return <main className={styles.gallery} data-deck-pose-review={pose.value}>
    <header className={styles.galleryHeader}>
      <div><h1>CDvicious · Deck físico</h1><p>Tres poses del mismo equipo · revisión estática</p></div>
      <nav className={styles.poseNav} aria-label="Poses del equipo">
        {poses.map((item) => <Link key={item.value} href={`/deck-poses?pose=${item.value}`} prefetch={false} aria-current={item.value === pose.value ? "page" : undefined}>{item.title}</Link>)}
      </nav>
    </header>
    <div className={styles.galleryStage}>
      <PhysicalDeck pose={pose.value} albumName="CAMPO MAGNÉTICO" artwork="/images/discography/demo-0.png" staticMode />
    </div>
    <p className={styles.poseCaption}>{pose.description}</p>
  </main>;
}
