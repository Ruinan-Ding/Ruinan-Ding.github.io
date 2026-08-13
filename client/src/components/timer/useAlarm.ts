import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ALARM_BURST_COUNT, ALARM_BURST_GAP_TICKS, ALARM_GROUP_GAP_TICKS, ALARM_TICK_MS, ALARM_TOTAL_BURSTS, TONES } from './constants';

interface AlarmOptions {
  /** running, unpaused and past zero: the alarm's whole reason to sound */
  isActive: boolean;
  /** past zero at all, paused included — what one ring's allowance is spent on */
  isOvertime: boolean;
  /** repeat: on, the alarm rings until stopped; off, one finite ring */
  isLooping: boolean;
  isSilent: boolean;
  beep: (frequency?: number, duration?: number, volumeOverride?: number) => () => void;
}

// The alarm: the beep pattern, and the two flags the window flashes off it.
//
// isRinging is true while the beep interval runs, isBeepFlash pulses red on
// each individual beep, and hasRungOut marks a finite ring that finished on
// its own — the "you missed this" cue the digits keep wearing afterwards.
//
// clearAlarm is the door out for everything that restarts the countdown
// from a fresh total: the sound has to stop where it is, before the state
// that would have stopped it re-renders.
export function useAlarm({ isActive, isOvertime, isLooping, isSilent, beep }: AlarmOptions) {
  const beepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Read through a ref inside the pattern below rather than as a
  // dependency: toggling mute mid-ring should stop the sound where it is,
  // not tear down and restart the flashing that goes with it.
  const isSilentRef = useRef(isSilent);
  isSilentRef.current = isSilent;
  // With repeat off the alarm gets one finite ring per overtime period,
  // and the allowance is spent the moment ringing starts. Pause/resume and
  // mute can't squeeze out extra groups, turning repeat off mid-ring mutes
  // at once, and it resets when the timer leaves negative time.
  const rungThisOvertimeRef = useRef(false);
  // The pattern position lives in a ref too, so effect re-runs from repeat
  // or pause toggles continue the ring instead of restarting it.
  const tickRef = useRef(0);
  // With repeat off, a ring that finishes on its own leaves the digits
  // faded red as a "you missed this" cue. Cleared by turning repeat back
  // on or leaving overtime.
  const [hasRungOut, setHasRungOut] = useState(false);
  const [isRinging, setIsRinging] = useState(false);
  const [isBeepFlash, setIsBeepFlash] = useState(false);

  // Layout effect, not effect: this can fire in the same commit as seconds
  // going non-negative, and running after paint gives a one-frame flash of
  // solid red digits on an otherwise fresh countdown.
  useLayoutEffect(() => {
    if (!isOvertime) {
      rungThisOvertimeRef.current = false;
      tickRef.current = 0;
      setHasRungOut(false);
    }
  }, [isOvertime]);
  useEffect(() => {
    if (isLooping) setHasRungOut(false);
  }, [isLooping]);

  useEffect(() => {
    if (!isActive) return;
    if (!isLooping && rungThisOvertimeRef.current) {
      // Repeat turned off mid-ring mutes immediately rather than finishing
      // the pattern. Treated the same as the ring completing, so the
      // digits still fade red.
      setHasRungOut(true);
      return;
    }
    // Spent by the overtime period, not by whether anyone heard it: a
    // muted ring still counts as the one ring repeat-off allows, so
    // unmuting part-way through doesn't start another. Unmuting mid-ring
    // does pick up the beeps from the next tick, since playTick reads mute
    // through a ref, but it won't replay what it already flashed.
    rungThisOvertimeRef.current = true;

    const pattern: boolean[] = [];
    for (let burst = 0; burst < ALARM_TOTAL_BURSTS; burst++) {
      for (let i = 0; i < ALARM_BURST_COUNT; i++) pattern.push(true);
      const gapTicks = burst === ALARM_TOTAL_BURSTS - 1 ? ALARM_GROUP_GAP_TICKS : ALARM_BURST_GAP_TICKS;
      for (let i = 0; i < gapTicks; i++) pattern.push(false);
    }

    const playTick = () => {
      // With repeat off the ring is one full pass through the pattern,
      // every burst of it, not just the first.
      if (!isLooping && tickRef.current >= pattern.length) {
        if (beepIntervalRef.current) clearInterval(beepIntervalRef.current);
        beepIntervalRef.current = null;
        setIsRinging(false);
        setHasRungOut(true);
        return;
      }
      if (pattern[tickRef.current % pattern.length]) {
        if (!isSilentRef.current) beep(...TONES.alarm);
        // Red for exactly as long as the beep sounds — or would have.
        setIsBeepFlash(true);
        window.setTimeout(() => setIsBeepFlash(false), TONES.alarm[1]);
      }
      tickRef.current++;
    };
    setIsRinging(true);
    playTick();
    beepIntervalRef.current = setInterval(playTick, ALARM_TICK_MS);

    return () => {
      if (beepIntervalRef.current) clearInterval(beepIntervalRef.current);
      beepIntervalRef.current = null;
      setIsRinging(false);
      setIsBeepFlash(false);
    };
  }, [isActive, isLooping, beep]);

  const clearAlarm = () => {
    if (beepIntervalRef.current) {
      clearInterval(beepIntervalRef.current);
      beepIntervalRef.current = null;
    }
  };

  return { isRinging, isBeepFlash, hasRungOut, clearAlarm };
}
