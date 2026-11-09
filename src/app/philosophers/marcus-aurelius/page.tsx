import type {Metadata} from 'next';
import Atlas from '@/components/Atlas';

export const metadata: Metadata = {title: 'Марк Аврелий — личное знакомство | Атлас философии', description: 'Биография, идеи, произведения и интерактивные разговоры: Марк Аврелий.'};
export default function PhilosopherRoute() {return <Atlas initialPhilosopherId="marcus-aurelius"/>;}
