import Svg, { Circle, Ellipse, Line, Path, Rect } from 'react-native-svg';
import { colors, dark } from '../../theme';

const SKIN = '#8A5A3C';
const INK = '#0E1412';
const TROUSERS = '#1E2B33';
const BOX = colors.orange;
const BOX_DARK = '#D9740C';
const SCOOTER = colors.green;
const JACKET = dark.green;

/**
 * Illustration de Yaar (dessin original, à plat) : un livreur souriant sur sa moto, caisse de livraison orange à
 * l'arrière, sur un disque vert sombre. Couleurs de la marque ; pensée pour un fond sombre. Purement décorative
 * (masquée aux lecteurs d'écran : le texte de l'écran dit tout).
 */
export function CourierIllustration({ width = 300, testID }: { width?: number; testID?: string }) {
  const height = Math.round((width * 240) / 320);
  return (
    <Svg width={width} height={height} viewBox="0 0 320 240" testID={testID}>
      {/* Décor : disque, éclats, traits de vitesse, ombre au sol. */}
      <Circle cx={165} cy={118} r={104} fill="#14261E" />
      <Circle cx={66} cy={58} r={4} fill={dark.green} opacity={0.55} />
      <Circle cx={274} cy={92} r={5} fill={dark.green} opacity={0.3} />
      <Circle cx={248} cy={34} r={3} fill={BOX} opacity={0.7} />
      <Line x1={18} y1={132} x2={46} y2={132} stroke={dark.green} strokeWidth={6} strokeLinecap="round" opacity={0.3} />
      <Line x1={10} y1={150} x2={52} y2={150} stroke={dark.green} strokeWidth={6} strokeLinecap="round" opacity={0.55} />
      <Line x1={26} y1={168} x2={56} y2={168} stroke={dark.green} strokeWidth={6} strokeLinecap="round" opacity={0.4} />
      <Ellipse cx={168} cy={212} rx={112} ry={9} fill="#000000" opacity={0.35} />

      {/* Caisse de livraison sur son support. */}
      <Rect x={64} y={142} width={60} height={7} rx={3.5} fill="#095C39" />
      <Rect x={58} y={92} width={66} height={52} rx={8} fill={BOX} />
      <Rect x={54} y={84} width={74} height={16} rx={6} fill={BOX_DARK} />
      <Rect x={74} y={108} width={34} height={22} rx={5} fill="#FFFFFF" opacity={0.94} />
      <Path d="M83 119.5l5 5 9.5-10.5" stroke={SCOOTER} strokeWidth={3.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />

      {/* Garde-boue arrière, roues. */}
      <Path d="M70 184a29 29 0 0 1 56-8" stroke={SCOOTER} strokeWidth={7} strokeLinecap="round" fill="none" />
      <Line x1={222} y1={112} x2={236} y2={186} stroke={INK} strokeWidth={8} strokeLinecap="round" />
      {[98, 236].map((cx) => (
        <Circle key={`t${cx}`} cx={cx} cy={186} r={25} fill={INK} stroke="#33403B" strokeWidth={3} />
      ))}
      {[98, 236].map((cx) => (
        <Circle key={`h${cx}`} cx={cx} cy={186} r={10.5} fill="#C9D3CE" />
      ))}
      {[98, 236].map((cx) => (
        <Circle key={`a${cx}`} cx={cx} cy={186} r={4} fill={INK} />
      ))}
      <Path d="M212 178a28 28 0 0 1 50-6" stroke={SCOOTER} strokeWidth={7} strokeLinecap="round" fill="none" />

      {/* Moto : caisse, reflet, selle, plancher, tablier, guidon, phare. */}
      <Path
        d="M66 168c0-18 16-26 34-26h68c8 0 14 6 14 14v10c0 6-5 10-11 10H78c-7 0-12-4-12-8z"
        fill={SCOOTER}
      />
      <Line x1={86} y1={152} x2={150} y2={152} stroke={dark.green} strokeWidth={4} strokeLinecap="round" opacity={0.75} />
      <Rect x={104} y={132} width={66} height={13} rx={6.5} fill="#14201A" />
      <Rect x={170} y={166} width={46} height={12} rx={6} fill={SCOOTER} />
      <Path d="M206 178c-6-18-4-50 8-74l12 4c-8 20-8 48-4 70z" fill={SCOOTER} />
      <Line x1={216} y1={106} x2={212} y2={92} stroke={INK} strokeWidth={6} strokeLinecap="round" />
      <Line x1={203} y1={92} x2={227} y2={88} stroke={INK} strokeWidth={7} strokeLinecap="round" />
      <Circle cx={229} cy={118} r={6.5} fill="#FFE08A" />

      {/* Livreur : jambe, chaussure, veste, bras, main, tête et casque. */}
      <Path d="M140 140l38 10 6 18" stroke={TROUSERS} strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Rect x={176} y={164} width={24} height={10} rx={5} fill={INK} />
      <Path d="M128 142c-4-22 6-44 26-54l16-4c10 0 16 8 14 18l-8 26c-4 12-16 18-30 18z" fill={JACKET} />
      <Line x1={151} y1={97} x2={141} y2={138} stroke="#22A86C" strokeWidth={3} strokeLinecap="round" />
      <Path d="M172 98l26 6 10-12" stroke={JACKET} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Circle cx={210} cy={91} r={6.5} fill={SKIN} />
      <Rect x={168} y={76} width={12} height={13} rx={4} fill={SKIN} />
      <Circle cx={176} cy={66} r={14} fill={SKIN} />
      <Path d="M159.5 67c-.5-13 7.5-21 17.5-21s17 7 16 17l-17 3z" fill="#F3F6F4" />
      <Path d="M162 58c6-8 20-10 27-4" stroke={BOX} strokeWidth={3} strokeLinecap="round" fill="none" />
      <Path d="M180 58.5l13 1.5-.8 6.2-12.6-1.2z" fill={INK} opacity={0.85} />
      <Circle cx={185} cy={69.5} r={1.7} fill="#1A120D" />
      <Path d="M182 75c2.4 2 5 2 7.4-.6" stroke="#1A120D" strokeWidth={1.7} strokeLinecap="round" fill="none" />

      {/* Épingle de destination, au-dessus. */}
      <Path d="M262 74c-.3 0-11-9.6-11-18a11 11 0 0 1 22 0c0 8.4-10.7 18-11 18z" fill={dark.green} />
      <Circle cx={262} cy={56} r={4} fill="#14261E" />
    </Svg>
  );
}
