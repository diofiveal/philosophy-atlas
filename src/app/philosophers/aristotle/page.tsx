import type {Metadata} from 'next';
import Atlas from '@/components/Atlas';

export const metadata: Metadata = {title: 'Аристотель — личное знакомство | Атлас философии', description: 'Биография, идеи, произведения и интерактивные разговоры: Аристотель.'};
export default function PhilosopherRoute() {return <Atlas initialPhilosopherId="aristotle"/>;}
