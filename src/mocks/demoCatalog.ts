import collection from "@/mocks/collection.json";
import { mockArtistReleases, mockArtists } from "@/mocks/artistCatalog";
import { matchesLyricsSignature, type LyricsSignature } from "@/lib/lyrics";
import type { AlbumItem } from "@/types/crate";
import type { LyricsResponse } from "@/types/lyrics";
import type { SpotifyTrack } from "@/types/spotify";

type DemoTrackDefinition = {
  name: string;
  duration_ms: number;
  result: Pick<LyricsResponse, "status" | "lyrics">;
};
export type MockTrack = SpotifyTrack & { track_number: number; uri: string };

const song = (name: string, duration_ms: number, lyrics: string): DemoTrackDefinition => ({
  name, duration_ms, result: { status: "available", lyrics },
});
const instrumental = (name: string, duration_ms: number): DemoTrackDefinition => ({
  name, duration_ms, result: { status: "instrumental", lyrics: null },
});
const unavailable = (name: string, duration_ms: number): DemoTrackDefinition => ({
  name, duration_ms, result: { status: "unavailable", lyrics: null },
});

// Original fictional lyrics, configured per recording. There is deliberately no
// shared lyric template: albums outside these six have no configured lyrics.
export const demoSessionTracklists: Record<string, DemoTrackDefinition[]> = {
  "mock-album-01": [
    song("Ventana de neón", 203_000, `Ventana de neón: la tarde guarda un tren.
Hay una taza tibia junto al ventanal.
Tu bicicleta espera donde termina el andén.
La casa enciende el cielo con su luz de coral.

Dejame una señal entre la lluvia y el café.
Mañana abrimos juntos lo que falta por hacer.`),
    song("Ascensor azul", 187_000, `Ascensor azul: subimos sin contar los pisos.
Una vecina lleva flores de papel.
El techo se aleja con nuestros compromisos.
La puerta abre despacio sobre otro amanecer.

El botón del último piso todavía no se ve.
Aprendimos a llegar sin preguntar por qué.`),
    song("Mapa de azoteas", 321_000, `Mapa de azoteas: dibujo la ciudad que todavía no existe.
El primer techo tiene una huerta en un cajón.
Una mujer saluda al sol que se resiste.
El segundo guarda un viejo acordeón.
Subo una escalera de pintura desprendida.
La calle queda abajo, pequeña y encendida.

En el tercero un perro sueña con el río.
En el cuarto hay sábanas moviéndose al compás.
Una radio cuenta que se acerca el frío.
Una maceta aprende otra forma de esperar.
No hay dos ventanas que miren de igual modo.
Cada horizonte se construye poco a poco.

Trazo una línea donde acaba la avenida.
Dibujo un puente que podamos cruzar.
Escribo nuestros nombres al borde de la vida.
Dejo una esquina sin terminar.
Ese espacio no es un sitio abandonado.
Es el lugar que te guardé para mañana.

Quinto techo: una antena mira al este.
Sexto techo: una pelota sin volver.
Séptimo: un cine improvisa su cartel.
Octavo: alguien empieza a aprender.
La película no tiene protagonistas.
Somos la gente que se asoma a las cornisas.

Mapa de azoteas, mapa de venir.
Cada terraza tiene algo que decir.
Si no hay un camino lo podemos compartir.
Si falta una palabra la dejamos respirar.
La noche llega lenta hasta el borde del papel.
Ninguna calle pierde su manera de volver.

Noveno techo: las abejas hacen ronda.
Décimo: una mesa con lugares para seis.
En el once un chico mide con una soga
la distancia que separa su cometa del andén.
La ciudad no cabe entera en un bolsillo.
Pero cabe en la promesa de encontrarnos.

En el doce una guitarra cambia cuerdas.
En el trece se prepara una canción.
El catorce tiene puertas siempre abiertas.
En el quince un farol cambia de color.
Yo sigo por los márgenes del plano.
Vos seguís dejando migas en verano.

Doblo el papel sin doblar las estaciones.
Guardo el lápiz donde duerme el celular.
Entre antenas aparecen otras voces.
Son vecinos que se animan a cantar.
Cada nota encuentra un sitio en el dibujo.
Cada pausa deja entrar un poco de futuro.

Mapa de azoteas, mapa de venir.
Cada terraza tiene algo que decir.
Si no hay un camino lo podemos compartir.
Si falta una palabra la dejamos respirar.
La noche llega lenta hasta el borde del papel.
Ninguna calle pierde su manera de volver.

Y al final no hay una cruz ni un punto rojo.
Hay un banco y dos tazas junto al sol.
Una página se cierra con tus ojos.
Otra empieza donde empieza nuestra voz.
El mapa sigue abierto sobre el suelo.
Mañana dibujamos otro cielo.`),
    instrumental("Interludio de vidrio", 164_000),
    unavailable("Postal sin remitente", 218_000),
    song("Patio magnético", 196_000, `Patio magnético: giran las hojas sin viento.
La mesa de domingo conserva una canción.
Un plato dibuja su órbita en silencio.
La tarde se acomoda alrededor de tu voz.
No hace falta una brújula para reconocer
el norte de esta casa cuando empezamos a volver.`),
    song("Turno de noche", 232_000, `Turno de noche: la panadería enciende el mar.
La harina cae despacio sobre un mapa de madera.
El último colectivo se detiene a saludar.
Las manos van contando lo que falta hasta la entrega.
Cuando despierta el barrio y se levanta la persiana,
queda un poco de nosotros en el pan de la mañana.`),
    song("La habitación del eco", 209_000, `La habitación del eco tiene cortinas de algodón.
Le cuento mis preguntas y me devuelve el sonido.
Sobre el parquet descansa la caja de un tambor.
Hay un hueco en la pared donde guardamos el verano.
Abro de par en par para que entre una respuesta.
Tu risa llega antes de que termine la siesta.`),
    song("Pasarela", 175_000, `Pasarela: dos barrios se dan la mano sobre el agua.
Un pescador levanta la vista del reloj.
La ciudad deja un hilo entre sus dos orillas.
Yo cruzo sin apuro para escuchar tu voz.
Del otro lado queda una plaza por conocer.
Volvemos por el puente cuando empiece a llover.`),
    song("Última luz del edificio", 247_000, `Última luz del edificio: alguien todavía está leyendo.
Las otras ventanas ya se fueron a dormir.
Un párrafo sostiene lo que el día estaba perdiendo.
Un gato se acomoda junto al borde del sillón.
Cierro el libro despacio, dejo el faro encendido.
Hay quien vuelve tarde y necesita ese latido.`),
  ],
  "demo-vertice-album-0": [
    song("Órbita de papel", 228_000, `Órbita de papel: tu carta rodea la mesa.
La aguja de una brújula se olvida de apuntar.
En cada vuelta cambia de lugar nuestra promesa.
La tinta todavía tiene ganas de viajar.
Doblo el universo por la línea del correo.
Todo lo que escribo vuelve a empezar cuando te leo.`),
    song("Campo abierto", 241_000, `Campo abierto: el horizonte aprende nuestros nombres.
Un molino hace sombra sobre un charco de cristal.
Las botas van dejando dos caminos diferentes.
Los dos se encuentran donde empieza el pastizal.
Lejos de las torres se escucha el corazón.
El viento nos responde sin subir la voz.`),
    song("Aguja norte", 199_000, `Aguja norte: no me señales lo que falta.
Marcame la esquina que nos vio crecer.
La calle guarda el trazo de una antigua bicicleta.
El cielo sigue siendo un cuaderno por leer.
Si el mapa se equivoca seguimos por el sol.
Nuestro norte cabe dentro de esta canción.`),
    song("Imanes en la heladera", 183_000, `Imanes en la heladera sujetan el mes de abril.
Un dibujo de la costa se parece a tu sonrisa.
La lista de la compra dice que hay que compartir
la última naranja y una tarde sin prisa.
Hay viajes muy pequeños que nos llevan muy lejos.
El mundo gira entero en nuestros azulejos.`),
    song("El lado de la sombra", 268_000, `El lado de la sombra conserva el fresco del nogal.
Me siento con mis dudas a escuchar las bicicletas.
El sol pasa de largo y me deja descansar.
No todas las preguntas necesitan una meta.
Cuando baje la tarde volveremos a caminar.
La sombra de este árbol nos sabrá esperar.`),
    song("Tiza en el asfalto", 177_000, `Tiza en el asfalto: una rayuela llega al cielo.
La lluvia de anoche no pudo con el diez.
Saltamos el lunes con los bolsillos llenos.
Hay piedras que conocen dónde quieren caer.
Si se borra el camino dibujamos otra vez.
El cielo queda cerca cuando estamos de a tres.`),
    song("Bolsillo de cobre", 216_000, `Bolsillo de cobre: monedas para volver.
El guarda marca el ritmo de los postes de la ruta.
Una radio quebrada nos recuerda el ayer.
La noche tiene luces que se mueven diminutas.
Te guardo un asiento del lado de la luna.
Llegamos a la plaza cuando cierre la verdura.`),
    song("Vértigo doméstico", 193_000, `Vértigo doméstico: bailan las sillas del comedor.
La escoba tiene un traje que le queda demasiado.
Los platos hacen coro con el viejo ventilador.
Nos reímos del paso que jamás habíamos ensayado.
La casa se convierte en una pequeña estación.
No hacen falta valijas para cambiar de dirección.`),
    song("Satélites del patio", 254_000, `Satélites del patio: dos naranjas sobre el mantel.
Una abeja se detiene a consultar la primavera.
El perro dibuja elipses persiguiendo su cordel.
La tarde se parece a la de aquella vez primera.
Si el universo llama que nos vuelva a llamar.
Estamos ocupados aprendiendo a merendar.`),
    song("La brújula descansa", 287_000, `La brújula descansa debajo de la cama.
Ya sabe dónde estamos y nos deja conversar.
La lluvia pone puntos al final de cada rama.
Ninguna coordenada nos obliga a regresar.
Apago el velador después de la última página.
Mañana queda cerca cuando el viaje se termina.`),
  ],
  "mock-album-02": [
    song("Antena del sur", 214_000, `Antena del sur: la lluvia cambia de estación.
Alguien pone un disco en un pueblo junto al agua.
La radio encuentra sitio en nuestra conversación.
La noche deja gotas en la manga de tu abrigo.
Si se pierde la señal no me sueltes de la mano.
Tu voz llega más lejos que el dial más lejano.`),
    song("Kilómetro nocturno", 229_000, `Kilómetro nocturno: una curva recoge las estrellas.
El chofer acomoda un recuerdo en el espejo.
Las luces de una casa parpadean desde afuera.
El río lleva el sueño de los pueblos viejos.
En cada cartel guardamos una posibilidad.
La ruta sigue abierta hasta el borde de la ciudad.`),
    song("Pequeña frecuencia", 186_000, `Pequeña frecuencia: encuentro una voz entre dos mares.
Dice que hay tiempo de volver a comenzar.
Mis manos acercan la radio a los ventanales.
La estática se abre como un patio al respirar.
No sé de dónde viene ni hacia dónde partirá.
Pero esta noche sabe hacernos compañía.`),
    song("La costa encendida", 265_000, `La costa encendida dibuja un collar sobre el puerto.
Un barco se acomoda en la oscuridad.
Mi hermana manda un beso desde un teléfono abierto.
La luna en el agua no deja de temblar.
Miro hacia el sur con la ventana entreabierta.
La misma luz nos encuentra aunque estemos lejos.`),
    song("Estación de niebla", 237_000, `Estación de niebla: los trenes llegan sin sombra.
El kiosco de diarios ofrece un poco de sol.
El altavoz pronuncia una ciudad que nadie nombra.
Los pasos se detienen para oír la explicación.
Nos vamos cuando aclare, dice el hombre del café.
Mientras tanto compartimos lo que queda por leer.`),
    song("Señal de regreso", 201_000, `Señal de regreso: dejaste una luz en el balcón.
El viento se entretiene con las mangas de tu saco.
Yo vuelvo de la costa con arena en el reloj.
Un taxi dobla lento para esquivar el charco.
Ya puedo ver tu sombra acercándose al portón.
La noche se hace casa al escuchar tu canción.`),
    song("Los nombres del agua", 278_000, `Los nombres del agua se escriben sin papel.
El río cambia letras cuando pasa por la isla.
Un bote lleva historias amarradas al cordel.
La orilla las escucha sin quedarse con ninguna.
Le digo mi secreto al remolino del final.
Lo encuentro mar adentro convertido en temporal.`),
    song("Bajo el transmisor", 192_000, `Bajo el transmisor crecen flores amarillas.
Nadie les explicó de circuitos ni potencia.
Las cuida una vecina que trabaja en la taquilla.
Les canta cuando vuelve después de la tormenta.
La torre toca el cielo con un dedo de metal.
Las flores hacen tierra sin dejar de transmitir.`),
    song("Faro de bolsillo", 168_000, `Faro de bolsillo: una linterna nos alcanza.
Dos pilas y un camino detrás del terraplén.
La noche abre ventanas en la lenta caminata.
Tus botas van marcando dónde quiero poner mis pies.
Si el mundo se oscurece no hace falta amanecer.
Con esta luz pequeña nos podemos reconocer.`),
    song("Cuando cierre la radio", 296_000, `Cuando cierre la radio dejamos de adivinar.
La aguja vuelve al borde del último sonido.
El mar lleva las voces hasta otro lugar.
La noche guarda un sitio para quienes no han dormido.
Mañana abrimos juntos las cortinas del dial.
El día tiene historias que todavía no escuchamos.`),
  ],
  "demo-satelite-album-1": [
    song("Dial en cero", 225_000, `Dial en cero: la ciudad espera una palabra.
Los taxis tienen sueños que no salen del motor.
Una señal pequeña atraviesa la persiana.
Y un barrio entero aprende a respirar mejor.
Decime dónde empieza la primera melodía.
Que encuentre a los que vuelven antes de que nazca el día.`),
    song("Plaza de las antenas", 208_000, `Plaza de las antenas: se reúnen las palomas.
Los chicos hacen ruedas alrededor del rosedal.
Mi abuelo deja un diario con noticias de otra hora.
El banco de la esquina nos invita a conversar.
Las ondas van y vienen sobre nuestra merienda.
La plaza siempre sabe qué frecuencia nos encuentra.`),
    song("La línea del estuario", 273_000, `La línea del estuario se confunde con el cielo.
Dos tonos de celeste se resisten a acabar.
Un pescador recoge su paciencia del anzuelo.
Las nubes van cambiando la manera de viajar.
Me quedo hasta que el agua se parezca a tu canción.
Hay costas que regresan sin pedir explicación.`),
    song("Semáforo en ámbar", 197_000, `Semáforo en ámbar: quedémonos un rato.
El cruce tiene historias debajo del alquitrán.
Un músico afina la cuerda de su retrato.
Las luces de los coches lo acompañan al pasar.
Si cambia a verde y nadie tiene prisa por seguir,
podemos darle al tiempo un lugar donde vivir.`),
    instrumental("Baliza", 142_000),
    song("El ruido de la nieve", 244_000, `El ruido de la nieve se parece a una sábana al caer.
La tele sin antena nos regala un cielo blanco.
Jugamos a encontrar las formas que no se dejan ver.
El frío se detiene antes de llegar al banco.
Tu mano en el bolsillo me devuelve la estación.
Hay nieve en la pantalla y verano en el sillón.`),
    song("La casa del operador", 211_000, `La casa del operador tiene un timbre que no suena.
La puerta siempre espera a quien quiera conversar.
En cada habitación se acomoda una antena.
Un mate cruza el patio como un barco sin amarrar.
Si el mensaje no termina lo seguimos al volver.
Las voces de esta casa no se quieren desconectar.`),
    song("Dos minutos de cielo", 154_000, `Dos minutos de cielo antes de entrar al subterráneo.
Una nube se detiene justo arriba del café.
La gente guarda el lunes en los bolsillos del saco.
Yo guardo ese pedazo de azul para después.
Lo abro en el andén cuando se apaga el cartel.
El viaje tiene techo, pero yo también tengo cielo.`),
    song("Puente de ondas", 236_000, `Puente de ondas: los saludos cruzan sin peaje.
Mi madre cuenta cómo amaneció del otro lado.
El cable lleva risas que no entran en el equipaje.
La mesa pone sitio a quienes hoy se han alejado.
Acercá la taza para escuchar el mar.
Hay voces que son puentes cuando no podemos viajar.`),
    song("Otra mañana al sur", 282_000, `Otra mañana al sur: el puerto se despereza.
La radio de la feria saluda al pescador.
El sol se sienta lento en el borde de la mesa.
Los barcos ya conocen el camino del calor.
No apagues el parlante al terminar esta canción.
El día tiene algo que decirnos a los dos.`),
  ],
  "mock-album-03": [
    song("Esquinas de cristal", 198_000, `Esquinas de cristal: tu reflejo dobla antes que vos.
Un local vacío guarda fiestas de otro enero.
Los pasos hacen ruido en el piso del hall.
Detrás de cada puerta espera un barrio entero.
Nos vemos cuando cierre la ciudad de los carteles.
Que alguien deje un paso entre tantas paredes.`),
    song("El pulso del cordón", 182_000, `El pulso del cordón marca el borde de la vereda.
La lluvia baja rápido buscando el empedrado.
Un chico deja un barco donde el agua lo acelera.
Su padre lo acompaña hasta el final de la cuadra.
La calle lleva prisa, pero sabe detenerse.
El barco de papel tiene derecho a perderse.`),
    song("Los días en el vidrio", 231_000, `Los días en el vidrio se superponen al mirar.
La tienda de la esquina conserva otro apellido.
Una foto desteñida vuelve a darnos qué pensar.
El polvo tiene fechas que el reloj ha confundido.
Pasamos una manga y aparece la ciudad.
El pasado no se borra, se aprende a atravesar.`),
    song("Persiana gris", 174_000, `Persiana gris: los lunes te levantan por la mitad.
El local huele a madera, a billetes y a café.
Una mujer saluda desde el otro lado del cristal.
La radio de la caja nos pregunta qué hacer.
Abrimos aunque el cielo no termine de aclarar.
Las cosas más pequeñas también saben empezar.`),
    unavailable("Cartel borrado", 207_000),
    song("Colectivo de las seis", 219_000, `Colectivo de las seis: dejame junto al mercado.
Tengo un ramo de palabras que quisiera entregar.
La avenida se estira después del último semáforo.
Los asientos de adelante empiezan a conversar.
Dos monedas del pasado, un boleto del presente.
El barrio va subiendo con su cara de siempre.`),
    song("La terraza del taller", 253_000, `La terraza del taller tiene tornillos en la tierra.
Un limonero crece entre dos tarros de pintura.
La sirena de las cinco deja abierta nuestra puerta.
Subimos a tomarle las medidas a la luna.
Abajo queda el ruido con su traje de metal.
Arriba todo el cielo tiene tiempo de escuchar.`),
    song("Ruido de llaves", 166_000, `Ruido de llaves: la noche reconoce tu llegada.
El perro mueve el mundo al escuchar el ascensor.
Un plato espera tibio al lado de la ventana.
La mesa tiene un cuento que te guardó el reloj.
Dejá el apuro afuera y sentate a descansar.
Hay casas que son puertos sin necesidad de mar.`),
    song("Viento en diagonal", 201_000, `Viento en diagonal: los paraguas pierden la forma.
La esquina da refugio al vendedor de diarios.
Tu bufanda se convierte en una larga bandera.
Nos reímos debajo de un balcón centenario.
Cuando amaine cruzamos, sin soltar la conversación.
La lluvia también sabe cambiar de dirección.`),
    song("Ciudad después del cierre", 264_000, `Ciudad después del cierre: los carteles dejan de mandar.
El barrendero encuentra una estrella entre las hojas.
La plaza se acomoda para escuchar pasar
las bicicletas lentas de la última ronda.
Yo vuelvo por las calles que aprendieron nuestros pasos.
La noche tiene ventanas y todas me dan la mano.`),
  ],
  "demo-inerciales-album-0": [
    song("Andén uno", 206_000, `Andén uno: el tren todavía no sabe mi destino.
La valija trae un pulóver y una foto sin marcar.
El guarda me pregunta si prefiero ir junto al vidrio.
Le digo que en el vidrio hay lugares por mirar.
Cuando suene la campana voy a dejar de dudar.
El viaje es una forma de animarse a comenzar.`),
    song("Rieles paralelos", 191_000, `Rieles paralelos: dos líneas se ponen de acuerdo.
La distancia entre nosotros no impide conversar.
El campo trae mensajes en papeles de viento.
Los postes los reciben y los vuelven a soltar.
Hay caminos que se encuentran sin tenerse que cruzar.
Nos alcanza con saber que vamos al mismo lugar.`),
    song("La boletería", 178_000, `La boletería tiene un reloj cinco minutos atrasado.
La señora del turno lo prefiere dejar así.
Dice que un poco de tiempo nunca está de más guardado.
Por si alguien necesita despedirse antes de partir.
Yo compro un pasaje y un instante de valor.
Tu abrazo entra completo en ese error del reloj.`),
    song("Estación talleres", 223_000, `Estación talleres: los hierros descansan al sol.
Una locomotora sueña con volver a la vía.
Los hombres de mameluco se reparten el calor.
Las manos van armando la forma de otro día.
Cada pieza que regresa tiene algo que contar.
Las cosas que se cuidan aprenden a durar.`),
    song("Vagón comedor", 238_000, `Vagón comedor: dos tazas cruzan la llanura.
El mozo guarda equilibrio como quien aprende a bailar.
Una pareja mira cómo cambia la pintura
del campo detrás del vidrio, siempre a punto de empezar.
La sobremesa dura lo que falta hasta el puente.
Hay viajes que se miden por la gente que se siente.`),
    song("La casa del guardabarrera", 249_000, `La casa del guardabarrera tiene geranios en hilera.
El tren les lleva viento a la hora de merendar.
Una niña cuenta ruedas apoyada en la tranquera.
Un perro la acompaña sin querer llevar la cuenta.
Cuando vuelve el silencio y se levanta el portón,
la casa sigue al ritmo del último vagón.`),
    song("Equipaje de mano", 184_000, `Equipaje de mano: lo que quiero cabe acá.
Un cuaderno, una bufanda, las llaves de tu casa.
El mapa tiene marcas que no pienso tachar.
El tren abre camino donde la tarde se apaga.
Si se pierde una valija ya sabremos qué hacer.
Hay cosas que viajan en nosotros sin tenerlas que traer.`),
    song("Paso a nivel", 163_000, `Paso a nivel: dejamos que la prisa vaya sola.
La barrera nos regala un minuto sin cruzar.
Un vecino saca el mate de una bolsa con historia.
La calle aprende un modo diferente de esperar.
Cuando el tren se aleja no termina nuestra charla.
Nos quedamos otro rato al costado de la vía.`),
    song("Ventanilla al oeste", 216_000, `Ventanilla al oeste: el sol viaja de pie.
No pagó ningún boleto ni pidió permiso al guarda.
Se sienta en las rodillas de quien vuelve del café.
Deja un hilo de cobre sobre el hombro de mi hermana.
El tren dobla despacio y lo vemos descender.
Mañana vuelve a subir, ya sabemos dónde es.`),
    song("Terminal de vuelta", 279_000, `Terminal de vuelta: alguien me espera sin mirar el reloj.
La estación huele a lluvia, a empanadas y a domingo.
Bajo con una historia que todavía no encontró
la forma de decir cuánto aprendí por el camino.
Tu abrazo marca el sitio donde acaba la distancia.
La próxima partida ya podrá esperar a mañana.`),
  ],
};

export const demoListeningAlbumIds = Object.keys(demoSessionTracklists);

const albumsById = new Map<string, AlbumItem>();
for (const album of [
  ...collection,
  ...mockArtists.flatMap((artist) => (["album", "single", "compilation"] as const).flatMap((group) => mockArtistReleases(artist.id, group))),
]) {
  if (!albumsById.has(album.id)) albumsById.set(album.id, album);
}

export function getMockAlbum(id: string): AlbumItem | undefined {
  return albumsById.get(id);
}

export function getMockPlaybackAlbums(): AlbumItem[] {
  return [...albumsById.values()];
}

export function getMockTracks(albumOrId: AlbumItem | string): MockTrack[] {
  const requested = typeof albumOrId === "string" ? getMockAlbum(albumOrId) : albumOrId;
  if (!requested) return [];
  const album = getMockAlbum(requested.id) ?? requested;
  const definitions = demoSessionTracklists[album.id] ?? Array.from({ length: 10 }, (_, index) => ({
    name: `DEMO TRACK ${String(index + 1).padStart(2, "0")}`,
    duration_ms: 150_000 + index * 9_000,
  }));
  return definitions.map((track, index) => {
    const id = `mock-track-${album.id}-${index + 1}`;
    return {
      id, uri: `spotify:track:${id}`, track_number: index + 1,
      name: track.name, duration_ms: track.duration_ms,
      artists: album.artists.map((artist) => ({ ...artist })),
      album: {
        id: album.id, name: album.name,
        images: album.images.map((image) => ({ url: image.url, width: image.width ?? 600, height: image.height ?? 600 })),
      },
    };
  });
}

export function resolveMockLyrics(signature: LyricsSignature): LyricsResponse {
  const matches: DemoTrackDefinition[] = [];
  for (const [albumId, tracks] of Object.entries(demoSessionTracklists)) {
    const album = getMockAlbum(albumId);
    if (!album) continue;
    for (const track of tracks) {
      if (matchesLyricsSignature({
        trackName: track.name, artistName: album.artists.map((artist) => artist.name).join(", "),
        albumName: album.name, duration: track.duration_ms / 1_000,
      }, signature)) matches.push(track);
    }
  }
  // An absent or ambiguous recording never borrows another track's lyrics.
  return { ...(matches.length === 1 ? matches[0].result : { status: "unavailable" as const, lyrics: null }), provenance: { provider: "demo" } };
}
