import Timer from '@/components/timer/Timer';

export default function Home() {
  return (
    // A landmark and a heading, neither of which the page had. There is
    // nothing on screen to promote: it is a clock and three buttons, and
    // the one piece of text that names the thing is the <title>. So the
    // heading is the same words, drawn for screen readers only.
    <main className="w-full h-dvh bg-black">
      <h1 className="sr-only">Write Timer</h1>
      <Timer />
    </main>
  );
}
