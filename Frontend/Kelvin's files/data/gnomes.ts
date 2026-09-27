/*
 * The gnome's characters. Each one speaks with its own ElevenLabs voice and talks in its own
 * personality (both chosen on the server, backend/src/app/talk/characters.py, by the same id);
 * here is only its name and how it looks on the turntable.
 */
import type { GnomeLook } from '../components/Turntable3D/Gnome3D'

export type GnomeId = 'ecko' | 'grandpa' | 'hype' | 'spooky'

export const GNOMES: { id: GnomeId; name: string; look?: GnomeLook }[] = [
  // the green gnome as he's always been
  { id: 'ecko', name: 'ECKO' },
  { id: 'grandpa', name: 'Grandpa', look: { coat: '#7a5a3c', trousers: '#4a3526', hat: '#2f4a7a', beard: '#b9b9b9', accessory: 'spectacles' } },
  { id: 'hype', name: 'Hype', look: { coat: '#f08a24', trousers: '#2b2b2b', hat: '#e0312b', beard: '#ffffff', accessory: 'sunglasses' } },
  { id: 'spooky', name: 'Spooky', look: { coat: '#3b2a4f', trousers: '#1e1726', hat: '#141018', beard: '#d8d4e3', accessory: 'lantern' } },
]
