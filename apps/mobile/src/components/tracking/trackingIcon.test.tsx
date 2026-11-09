import { render, type RenderResult } from '@testing-library/react-native';
import { Icon } from '../design/Icon';
import { ICON_PARTS, type IconName } from '../design/iconPaths';
import { TrackingIcon as WebTrackingIcon } from './TrackingIcon.web';

/** Tracés (`d`) et disques (`cx,cy,r`) rendus, dans l'ordre. */
function shapes(tree: RenderResult): string[] {
  return tree.container
    .queryAll((n) => typeof n.type === 'string' && /^(path|circle|RNSVGPath|RNSVGCircle)$/.test(n.type))
    .map((n) => (n.props.d ? `d:${String(n.props.d)}` : `c:${n.props.cx},${n.props.cy},${n.props.r}`));
}

describe('pictogrammes de la page publique (sans react-native-svg sur le web)', () => {
  it.each(Object.keys(ICON_PARTS) as IconName[])('%s : mêmes tracés que le pictogramme du système de design', async (name) => {
    const web = await render(<WebTrackingIcon name={name} size={20} color="#2FD38A" />);
    const design = await render(<Icon name={name} size={20} color="#2FD38A" />);
    const expected = ICON_PARTS[name].map((p) => ('c' in p ? `c:${p.c[0]},${p.c[1]},${p.c[2]}` : `d:${p.p}`));
    expect(shapes(web)).toEqual(expected);
    expect(shapes(design)).toEqual(expected);
  });

  it('web : SVG du navigateur décoratif, trait arrondi, couleur et taille demandées', async () => {
    const r = await render(<WebTrackingIcon name="phone" size={22} color="#FFFFFF" strokeWidth={2.4} testID="ico" />);
    const svg = r.container.queryAll((n) => n.type === 'svg')[0]!;
    expect(svg.props).toMatchObject({ width: 22, height: 22, viewBox: '0 0 24 24', 'aria-hidden': 'true' });
    const path = r.container.queryAll((n) => n.type === 'path')[0]!;
    expect(path.props).toMatchObject({ stroke: '#FFFFFF', strokeWidth: 2.4, strokeLinecap: 'round', fill: 'none' });
  });
});
