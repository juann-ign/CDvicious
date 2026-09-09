"use client";

import Image from "next/image";
import Link from "next/link";

export interface CollectionAlbum {
  id: string;
  name: string;
  artists: { name: string }[];
  images: { url: string }[];
  uri: string;
}

interface CollectionCrateProps {
  albums: CollectionAlbum[];
  totalCount?: number;
}

const DISPLAY_LIMIT = 72;

export function CollectionCrate({ albums, totalCount }: CollectionCrateProps) {
  const visibleAlbums = albums.slice(0, DISPLAY_LIMIT);
  const count = totalCount ?? albums.length;

  return (
    <section className="collection-crate" aria-labelledby="collection-crate-title">
      <div className="collection-crate__header">
        <div>
          <span className="collection-crate__eyebrow">ARCHIVE / MEDIA STORAGE</span>
          <h2 id="collection-crate-title">THE CRATE</h2>
        </div>
        <Link href="/crate" className="collection-crate__open">
          OPEN COLLECTION <span aria-hidden="true">↗</span>
        </Link>
      </div>

      <div className="collection-crate__body">
        <div className="collection-crate__rail" aria-hidden="true" />
        <div className="collection-crate__contents" aria-label={`${count} albums in collection`}>
          {visibleAlbums.map((album) => {
            const coverUrl = album.images[0]?.url;
            const artist = album.artists.map((item) => item.name).join(", ");

            return (
              <Link
                href={`/?album=${album.id}`}
                className="collection-crate__spine"
                key={album.id}
                title={`${album.name} — ${artist}`}
                aria-label={`Play ${album.name} by ${artist}`}
              >
                {coverUrl ? (
                  <Image
                    src={coverUrl}
                    alt=""
                    fill
                    sizes="28px"
                    className="collection-crate__spine-image"
                    unoptimized
                  />
                ) : null}
                <span className="collection-crate__spine-label">{album.name}</span>
              </Link>
            );
          })}
        </div>
        <div className="collection-crate__rail" aria-hidden="true" />
      </div>

      <div className="collection-crate__footer">
        <span>{count} CDS IN ARCHIVE</span>
        <span className="collection-crate__hint">SELECT AN ALBUM OR OPEN THE FULL BATEA</span>
      </div>

      <style jsx>{`
        .collection-crate {
          width: min(1420px, calc(100vw - 40px));
          margin: 0 auto;
          color: #e8eaed;
          background: linear-gradient(180deg, #25292f 0%, #15181c 100%);
          border: 1px solid #4d535d;
          border-top-color: #707780;
          box-shadow:
            0 30px 60px rgba(0, 0, 0, 0.55),
            inset 0 1px 0 rgba(255, 255, 255, 0.12),
            inset 0 -2px 8px rgba(0, 0, 0, 0.65);
        }

        .collection-crate__header,
        .collection-crate__footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          padding: 14px 20px;
          background: #101214;
        }

        .collection-crate__header {
          border-bottom: 1px solid #30343a;
        }

        .collection-crate__eyebrow,
        .collection-crate__footer,
        .collection-crate__open {
          font-family: "Courier New", monospace;
          font-size: 10px;
          letter-spacing: 2px;
        }

        .collection-crate__eyebrow {
          color: #717a85;
        }

        h2 {
          margin: 4px 0 0;
          font-family: Helvetica, Arial, sans-serif;
          font-size: 18px;
          letter-spacing: 5px;
          font-weight: 900;
        }

        .collection-crate__open {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
          color: #b8ffb8;
          text-decoration: none;
          border: 1px solid #39463c;
          background: #171c19;
          box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.8);
          transition: 160ms ease;
        }

        .collection-crate__open:hover,
        .collection-crate__open:focus-visible {
          color: #fff;
          border-color: #67d567;
          box-shadow: 0 0 14px rgba(103, 213, 103, 0.18);
        }

        .collection-crate__body {
          position: relative;
          display: grid;
          grid-template-columns: 18px 1fr 18px;
          min-height: 250px;
          padding: 22px 18px;
          background:
            linear-gradient(90deg, rgba(255, 255, 255, 0.04), transparent 8%, transparent 92%, rgba(255, 255, 255, 0.04)),
            #30353c;
          overflow: hidden;
        }

        .collection-crate__body::before,
        .collection-crate__body::after {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          height: 5px;
          background: #111316;
          box-shadow: inset 0 1px rgba(255, 255, 255, 0.07);
        }

        .collection-crate__body::before {
          top: 10px;
        }

        .collection-crate__body::after {
          bottom: 10px;
        }

        .collection-crate__rail {
          z-index: 2;
          background: linear-gradient(90deg, #15171a, #777e87 45%, #202328 60%, #101215);
          box-shadow: 0 0 8px rgba(0, 0, 0, 0.8);
        }

        .collection-crate__contents {
          display: flex;
          align-items: stretch;
          min-width: 0;
          padding: 18px 8px;
          overflow: hidden;
          perspective: 900px;
          background: linear-gradient(180deg, #151719 0%, #090a0c 100%);
          box-shadow: inset 0 0 28px rgba(0, 0, 0, 0.9);
        }

        .collection-crate__spine {
          position: relative;
          flex: 0 0 34px;
          height: 212px;
          margin-left: -5px;
          overflow: hidden;
          border: 1px solid #15171a;
          background: #24282d;
          box-shadow: 3px 0 5px rgba(0, 0, 0, 0.55);
          transform: rotateY(-8deg);
          transition: 180ms ease;
          text-decoration: none;
        }

        .collection-crate__spine:first-child {
          margin-left: 0;
        }

        .collection-crate__spine:hover,
        .collection-crate__spine:focus-visible {
          z-index: 5;
          transform: translateY(-8px) rotateY(-3deg) scaleX(1.08);
          border-color: #858b93;
        }

        .collection-crate__spine-image {
          object-fit: cover;
          filter: saturate(0.72) brightness(0.68);
        }

        .collection-crate__spine-label {
          position: absolute;
          inset: 8px 4px;
          z-index: 1;
          display: block;
          overflow: hidden;
          color: rgba(255, 255, 255, 0.68);
          font-family: "Courier New", monospace;
          font-size: 7px;
          font-weight: 700;
          letter-spacing: 0.5px;
          line-height: 1.1;
          writing-mode: vertical-rl;
          text-overflow: ellipsis;
          text-shadow: 0 1px 2px #000;
        }

        .collection-crate__footer {
          border-top: 1px solid #30343a;
          color: #68717b;
        }

        .collection-crate__hint {
          color: #4c555f;
        }

        @media (max-width: 700px) {
          .collection-crate {
            width: calc(100vw - 24px);
          }

          .collection-crate__header,
          .collection-crate__footer {
            padding: 12px 14px;
          }

          .collection-crate__hint {
            display: none;
          }

          .collection-crate__body {
            grid-template-columns: 10px 1fr 10px;
            min-height: 190px;
            padding: 18px 8px;
          }

          .collection-crate__spine {
            flex-basis: 27px;
            height: 155px;
          }
        }
      `}</style>
    </section>
  );
}
