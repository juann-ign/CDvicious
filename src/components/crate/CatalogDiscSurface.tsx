import styles from "./ArtistDiscography.module.css";

export interface CatalogDiscPresentation {
  name: string;
  year?: string;
  demoArtworkUrl?: string;
  reverse?: boolean;
}
export function CatalogDiscFace({ name, year, demoArtworkUrl, reverse = false }: CatalogDiscPresentation) {
  return <span className={reverse ? styles.back : styles.front}
    style={{ backgroundImage: !reverse && demoArtworkUrl ? `url("${demoArtworkUrl}")` : undefined, transform: "translateZ(1px)" }}>
    {!reverse && !demoArtworkUrl && <span className={styles.discLabel}>{name}<small>{year ?? "FECHA NO DISPONIBLE"}</small></span>}
    <span className={styles.hub} />
  </span>;
}
