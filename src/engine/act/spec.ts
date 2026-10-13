// Story animation script: a structured timeline of animation events per scene, not one
// image prompt per paragraph. Written by the AI storyboard (or by hand), checked by the
// sanitizer on the site, resolved against the narration timing by the director.
import type { CharLook, Emotion } from './rig.ts';

/** A person of the story; `look` is a preset name (minh, lan, an, khoa, linh, tuan) or a full look. */
export interface ActCast { id: string; name?: string; look: string | CharLook }

/**
 * When something happens, relative to the scene: seconds from its start (number), or a
 * narration cue: "L1" (line 1 starts), "L1+0.4", "L1@0.5" (halfway through line 1), "L1e" (it ends).
 */
export type When = number | string;

export interface ActBeat {
  who?: string;
  /** body action: walk, run, idle, wave, point, cross, hips, shy, nervous, talk, explain, listen, nod, shake,
   *  think, celebrate, sad, surprised, laugh, shrug, handshake, give, phone, sit, sit-talk, clap, facepalm, wait, look-around, bow */
  do?: string;
  at?: When;
  dur?: number;
  /** walk/run destination: x on the stage (-240..240) or an actor id (stops in front of them) */
  to?: number | string;
  /** turn towards an actor, or 1 (right) / -1 (left) */
  face?: string | number;
  emo?: Emotion;
  /** short speech bubble (≤ 8 words) */
  say?: string;
  /** thought bubble */
  think?: string;
  /** prop in the front hand (phone, cup, book, gift…), null to drop it */
  hold?: string | null;
  /** pops above the actor: check, cross, heart, bulb, question, exclaim, star */
  mark?: string;
  /** camera: close on this actor, two-shot, or wide */
  cam?: 'close' | 'two' | 'wide';
  sfx?: string;
}

export interface ActText {
  at?: When; dur?: number; text: string;
  /** stamp: keyword card · number: a figure · big: written by the hand (conclusion) · label: under an actor */
  kind?: 'stamp' | 'number' | 'big' | 'label' | 'note';
  /** label: actor it belongs to */
  who?: string;
}

export interface ActScene {
  /** place: street, park, bench, cafe, office, party, room, bus, blank */
  set?: string;
  /** drawn by the hand at the start: 'set', actor ids, prop ids, in this order */
  draw?: string[];
  /** where people stand on this stage (x: -240..240), how they arrive */
  cast?: { id: string; x: number; face?: number; do?: string; emo?: Emotion; enter?: 'left' | 'right' }[];
  props?: { id?: string; kind: string; x: number; y?: number; s?: number }[];
  beats?: ActBeat[];
  text?: ActText[];
  /** sai / đúng banner (comparison) */
  badge?: 'wrong' | 'right';
  /** how this scene follows the previous one */
  transition?: 'pan' | 'walk' | 'match' | 'morph' | 'cut' | 'draw';
  /** morph: an object of the previous scene turns into this kind (cross → check, cloud → bulb…) */
  morph?: { from: string; to: string };
  /** framing of the scene: wide shows the place, two frames both people, close one face */
  cam?: 'wide' | 'two' | 'close';
  /** this scene turns the story (new situation, reveal, contrast) */
  turn?: boolean;
}
