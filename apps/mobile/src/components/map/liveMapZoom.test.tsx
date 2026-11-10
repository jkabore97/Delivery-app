import { createRef } from 'react';
import { act, render } from '@testing-library/react-native';
import { LiveMap } from './LiveMap';
import type { LiveMapHandle } from './types';

// react-native-maps simulé : une MapView qui expose getCamera / animateCamera.
const mockCamera = { getCamera: jest.fn(), animateCamera: jest.fn(), fitToCoordinates: jest.fn() };
jest.mock('react-native-maps', () => {
  const { forwardRef: fwd, useImperativeHandle: imp } = jest.requireActual<typeof import('react')>('react');
  const MapView = fwd((_p: object, ref) => {
    imp(ref, () => mockCamera);
    return null;
  });
  const Noop = () => null;
  class AnimatedRegion {
    constructor() {}
    addListener() {
      return 'l';
    }
    removeListener() {}
    stopAnimation() {}
    setValue() {}
    timing() {
      return { start() {} };
    }
  }
  return { __esModule: true, default: MapView, Marker: Noop, MarkerAnimated: Noop, Polyline: Noop, Circle: Noop, AnimatedRegion, PROVIDER_GOOGLE: 'google' };
});

describe('LiveMap (Android / iOS) : zoom impératif `zoomRef`', () => {
  beforeEach(() => Object.values(mockCamera).forEach((f) => f.mockReset()));

  it('zoomBy(+1) : niveau de zoom (Google Maps) ou altitude divisée par deux (Apple Plans), compté comme un geste', async () => {
    const zoom = createRef<LiveMapHandle>();
    const gesture = jest.fn();
    await render(<LiveMap markers={[]} lines={[]} fitPoints={[{ lat: 12.37, lng: -1.52 }]} follow onUserGesture={gesture} zoomRef={zoom} />);
    mockCamera.getCamera.mockResolvedValueOnce({ zoom: 14 });
    await act(async () => zoom.current!.zoomBy(1));
    expect(mockCamera.animateCamera).toHaveBeenLastCalledWith({ zoom: 15 }, { duration: 300 });
    expect(gesture).toHaveBeenCalledTimes(1);
    mockCamera.getCamera.mockResolvedValueOnce({ altitude: 2000 });
    await act(async () => zoom.current!.zoomBy(-1));
    expect(mockCamera.animateCamera).toHaveBeenLastCalledWith({ altitude: 4000 }, { duration: 300 });
    // 0 : rien.
    await act(async () => zoom.current!.zoomBy(0));
    expect(mockCamera.getCamera).toHaveBeenCalledTimes(2);
  });
});
