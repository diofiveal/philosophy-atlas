import type {Metadata} from 'next';
import Atlas from '@/components/Atlas';

export const metadata: Metadata = {
  title: 'Сократ — личное знакомство | Атлас философии',
  description: 'Жизнь Сократа, искусство задавать вопросы, свидетельства Платона и Ксенофонта и интерактивные философские разговоры.',
};

export default function SocratesRoute() {
  return <Atlas initialPhilosopherId="socrates"/>;
}
