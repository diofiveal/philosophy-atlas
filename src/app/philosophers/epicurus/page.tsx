import type {Metadata} from 'next';
import Atlas from '@/components/Atlas';

export const metadata: Metadata = {title: 'Эпикур — личное знакомство | Атлас философии', description: 'Биография, идеи, произведения и интерактивные разговоры: Эпикур.'};
export default function PhilosopherRoute() {return <Atlas initialPhilosopherId="epicurus"/>;}
