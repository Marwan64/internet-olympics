import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

interface Props { params: { code: string } }

export function generateMetadata({ params }: Props): Metadata {
  const code = params.code.toUpperCase();
  return {
    title: `Join Room ${code} — Internet Olympics`,
    description: "You've been invited to play Internet Olympics! Join the room instantly — no download needed.",
  };
}

export default function JoinPage({ params }: Props) {
  redirect(`/?code=${params.code.toUpperCase()}`);
}
