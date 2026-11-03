// The cabinet's game list. Flip `live: true` when a game passes its done checklist.
// controls: keyboard | mouse | touch

export const GENRES = ['Arcade', 'Action', 'Puzzle', 'Strategy', '3D'];

export const GAMES = [
  { id: 'serpent', live: true, title: 'Serpent', accent: '#4dff88', genres: ['Arcade'], controls: ['keyboard', 'touch'],
    hook: 'Eat, grow, and don’t bite your own tail as the pace creeps up.' },
  { id: 'brickfall', live: true, title: 'Brickfall', accent: '#ff3d9a', genres: ['Arcade', 'Action'], controls: ['keyboard', 'mouse', 'touch'],
    hook: 'Smash every brick across hand-built levels with multi-ball and lasers.' },
  { id: 'merge-up', live: true, title: 'Merge Up', accent: '#ffd23f', genres: ['Puzzle'], controls: ['keyboard', 'touch'],
    hook: 'Slide and merge matching tiles to chase ever-bigger numbers.' },
  { id: 'sapper', live: true, title: 'Sapper', accent: '#7aa7ff', genres: ['Puzzle'], controls: ['mouse', 'touch'],
    hook: 'Read the numbers, flag the mines, clear the field.' },
  { id: 'rock-drift', live: true, title: 'Rock Drift', accent: '#c9c3ff', genres: ['Arcade', 'Action'], controls: ['keyboard'],
    hook: 'Drift through space and blast rocks into smaller and smaller rocks.' },
  { id: 'star-swarm', live: true, title: 'Star Swarm', accent: '#2de2e6', genres: ['Arcade', 'Action'], controls: ['keyboard', 'touch'],
    hook: 'Hold the line as alien waves swoop, dive and regroup.' },
  { id: 'block-drop', live: true, title: 'Block Drop', accent: '#b26bff', genres: ['Puzzle', 'Arcade'], controls: ['keyboard', 'touch'],
    hook: 'Fit the falling blocks together and clear lines before the well fills.' },
  { id: 'flutter', live: true, title: 'Flutter', accent: '#ffb347', genres: ['Arcade'], controls: ['keyboard', 'mouse', 'touch'],
    hook: 'One button. Endless gaps. How far can you flap?' },
  { id: 'hop-lane', live: true, title: 'Hop Lane', accent: '#8be04e', genres: ['Arcade', 'Action'], controls: ['keyboard', 'touch'],
    hook: 'Hop across endless roads, rivers and rails without getting squashed.' },
  { id: 'sky-reach', live: true, title: 'Sky Reach', accent: '#5fd0ff', genres: ['Action'], controls: ['keyboard', 'touch'],
    hook: 'Climb into the clouds on springs and power-ups — the ground is rising.' },
  { id: 'putt-park', live: true, title: 'Putt Park', accent: '#3ddc84', genres: ['Puzzle'], controls: ['mouse', 'touch'],
    hook: 'Nine holes of ramps, bumpers and one very rude windmill.' },
  { id: 'bastion', live: true, title: 'Bastion', accent: '#ff8a3d', genres: ['Strategy'], controls: ['mouse', 'touch'],
    hook: 'Build and upgrade towers to hold the road through fifteen waves.' },
  { id: 'hollow-maze', live: true, title: 'Hollow Maze', accent: '#9b7bff', genres: ['3D', 'Action'], controls: ['keyboard', 'touch'],
    hook: 'Lost in a foggy 3D maze, hunted by things that change with the holidays.' },
  { id: 'ridge-rider', live: true, title: 'Ridge Rider', accent: '#ff5a5a', genres: ['Action'], controls: ['keyboard', 'touch'],
    hook: 'Race dirt bikes over wild hills, win tokens, and upgrade your ride.' },
];
