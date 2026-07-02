// Shared spacebar state so the canvas knows to yield mousedown to the pan layer.
// When space is held, blocks must NOT start a move — the whole canvas pans
// instead (Figma behaviour).
export const spaceKey = { down: false }
