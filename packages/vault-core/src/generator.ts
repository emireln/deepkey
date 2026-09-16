import type { GeneratorOptions } from "@deepkey/types";

const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const NUM = "0123456789";
const SYM = "!@#$%^&*()-_=+[]{};:,.<>?";
const AMBIGUOUS = new Set(["O", "0", "I", "l", "1", "|"]);

const WORDS = `able acid acre aged also analog anchor apple apron arctic arena aroma artist atlas attic audio
autumn badge bagel baker bamboo banana barley basin batch beach beaver berry birch bison bitter
black blade blank blast blaze blend bliss block bloom blossom blueboard board boast bobcat
bold bolt bonus booth bottle bound boxer braid brake brand brass brave bread breeze brick
bridge bright brine brisk brook brush bubble bucket budge buffalo build bunch bundle bunker
burden burner burst cabin cactus camel canal candy canoe canvas canyon caper cargo carol
carve castle cedar chain chair chalk champ chapel charm chart chase cheap check cherry
chest chili chimney chipmunk chord cider cinch civic clamp clasp class clean clerk click
cliff climb cloak clock clone close cloud clover club coach coast cocoa comet comic
coral cork corn corner cosmic cotton couch cover coyote cradle craft crane crash crate
crave crawl crazy cream creek crest cricket crisp crop cross crowd crown crude crush
crust cubic cupid curve cycle daisy dance daring dart dash dawn deal dear debit
debug delta dense depot depth desk dewdrop diary digit diner diode disco ditch
diver dizzy dodge donor donut door double dozen draft dragon drain drama drawn
dream dress drift drill drink drive drone drop drum dryer dual duck dune
dusk dust eager eagle early earth easel east ebony echo edge eight elbow
elder elite elm ember emerald empty enact ending enjoy entry epic equal
erase error essay ester ethic even event every evoke exact extra fable
facet faded faint fairy faith false fancy farce farm fatal faucet feast
fence ferry fetal fever fiber field fiesta fifth fifty fight filer
final finch finger finish fir fire first fiscal fish five flag
flake flame flare flash flask flint flock flood floor flora flour
flow fluff fluid flush flute foam focus fog fold font food
force forest fork form fort forum fossil found fountain four fox
frame frank fresh fridge friend fringe frog front frost fruit
fudge fuel fully funnel furry fusion fuzzy galaxy gallon game
garden garlic gate gauge gazer gecko genius genre gentle giant
gift gill ginger giraffe given glacier glance glass gleam glide
globe gloom glove glow glue gnarl goat golden goose gopher
grace grain grand grape graph grasp grass gravel gravy graze
great green grid grimy grind groan grocery grove grow guard
guess guest guide guild guitar gulf gum gust gyro habit
haven hawk hazel header heart heath heavy hedge helix helm
help hemp herb herd hero heron hidden high hill hinge
hobby hockey honey honor hood hook hope horn horse hotel
hound hour house hover howl hub human humid humor hundred
hungry hunter hurry husky hybrid icon icy idea idle igloo
image imbue imply inca inch index indoor inertia infant ink
inlet inner input insect inside insight insult intact iris iron
island ivory jacket jaguar jazz jelly jet jewel jigsaw jockey
join jolly joust judge juice jumbo jumper jungle junior jury
keep kelp kettle key khaki kick kidney kind king kiosk
kite kiwi knife knight koala label labor ladder lager lake
lamb lamp lance land lane lantern large laser later laugh
layer lazy leader leaf league learn lemon lens level lever
light lilac lime linen lion liquid list little liver lizard
llama lobby local lodge loft logic long look loop lotus
loud love lower loyal lunar lunch lung lush lyric magnet
mail major maker mango maple marble march margin marine market
marsh mason match matrix maybe mayor meadow medal media melon
memo mentor mercy merge merit merry mesh metal meteor meter
method micro middle midnight might mile milk mill mimic mind
minor mint minus mirror mist mixer mobile model modest molar
moment money monk month moon moose moral morning moss motel
motor mountain mouse mouth movie mower muffin mule mural
museum music mustard myth nacho nail name nanny nasal nature
navy near nectar needle neon nerve nest never newly nexus
night nine noble noise north nose noted novel nudge nylon
oak oasis oatmeal object ocean octave odor offer office often
olive omega onion onyx open opera orange orbit orchard order
organ other otter ounce outer oven over owner ozone paddle
page paint palace palm panda panel panic paper parade park
parrot party pasta patch path patio pause peach pearl pebble
pedal pelican penalty pencil pepper perch petal phase phone
photo piano pickle picnic piece pike pillow pine piper pirate
pixel pizza place plain plane plant plate plaza plum plus
pocket poem point polar polaris pond pony pool poppy portal
potato pouch powder prairie press pride prime print prism
prize probe proof proud prune public puff pulse pumpkin punch
pupil puppy purple purse push puzzle quail quarry quartz queen
query quest quick quiet quilt quiz quote rabbit radar radio
raft rage rain raise rally ranch range rapid rare raspberry
ratio raven razor reach ready realm rebar rebel recipe
record red reed reef refer relax relay relic remix remote
repair replay rescue resin rest retro rhyme ribbon rice
ridge rifle right rigid rinse ripple rival river road roast
robin robot rock rocket roller roof room rooster root rose
round route royal rubber ruby rugby ruin ruler rumor runner
rural rust saber saddle safari safe sage sailor salad salmon
salon salsa salt sample sand satin sauce scale scan scare
scarf scene school scoop scope score scout scrap screen
script scuba season secret seed seeker seize self sense
serum serve seven shade shaft shaky shallow shard sharp
shawl shear sheep sheet shelf shell shield shift shine
shirt shock shore short shout shrimp shrub shrug side
sierra silk silver simple singer siren six skate sketch
skiff skill skirt skull sky slack sloth slow small smart
smile smoke snack snail snake snap snow soap soccer soda
sofa soft solar solid solve sonar sonic sorry sound soup
south space spare spark speak spear speed spell spice spider
spike spin spiral splash spoon sport spot spray spring
squad square stable staff stage stain stair stall stamp
stand star stash state steak steam steel steep stem
step stereo stick still sting stock stone stool store
storm story stove straw stream street stress strike
string strong studio study stuff stump style sugar
suit sulky summer sun super surge sushi swamp swan
sweep sweet swift swing swirl sword syrup table taco
taken talent talk tall tango tank taper target taste
tavern teach teal tempo tenant tent tesla thank
theme theory there thick thief thigh thing third
thorn those three throw thumb thunder ticket tidal
tiger tile timber timer tin tired title toast
today token tomato tone tools topic torch tornado
total touch towel tower town toxic track trade
trail train trait tramp trans trap trash tray
treat tree trend trial tribe trick trim trip
trout truck true trumpet trust truth tuba tube
tulip tuna tunnel turkey turn turtle tutor twelve
twenty twin twist type typhoon ultra uncle under
union unique unit unity until upper urban urge
usage useful vacant valley value vapor vault vegan
velvet vendor venom venue verb verify verse vessel
vest video view villa vinyl violin virus visa
visor vista vital vivid vocal vodka voice volt
volume voucher vowel voyage waffle wagon wait
walnut walrus waltz wander warm warn warrior
wash wasp watch water wave wax weakly wealth
weapon weary weather web wedge weekly weird
west whale wheat wheel where which while
whirl white whole whose widen width willow
wind window wine wing winter wire wisdom
wish witch wolf woman wonder wood wool
word work world worm worry worth would
wrap wreck wrist writer yacht yang yard
year yeast yellow yield yoga young youth
zebra zero zest zigzag zinc zip zone zoom`.split(/\s+/).filter(Boolean);

function randomInt(max: number): number {
  if (max <= 0) throw new Error("Invalid range.");
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / max) * max;
  let x = 0;
  do {
    crypto.getRandomValues(buf);
    x = buf[0]!;
  } while (x >= limit);
  return x % max;
}

function pick(chars: string): string {
  return chars[randomInt(chars.length)]!;
}

function shuffle(values: string[]): string[] {
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    const tmp = values[i]!;
    values[i] = values[j]!;
    values[j] = tmp;
  }
  return values;
}

function filterAmbiguous(chars: string, avoid: boolean): string {
  if (!avoid) return chars;
  return [...chars].filter((c) => !AMBIGUOUS.has(c)).join("");
}

export function generateSecret(options: GeneratorOptions): string {
  if (options.kind === "uuid") {
    return crypto.randomUUID();
  }
  if (options.kind === "passphrase") {
    const count = Math.min(12, Math.max(3, options.length || 6));
    const picked: string[] = [];
    const used = new Set<number>();
    while (picked.length < count) {
      const index = randomInt(WORDS.length);
      if (used.has(index) && used.size < WORDS.length) continue;
      used.add(index);
      picked.push(WORDS[index]!);
    }
    return picked.join("-");
  }
  const length = Math.min(256, Math.max(8, options.length));
  if (options.kind === "hex") {
    const bytes = new Uint8Array(Math.ceil(length / 2));
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").slice(0, length);
  }
  if (options.kind === "base64") {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "").slice(0, length);
  }

  if (options.kind === "token") {
    const alphabet = filterAmbiguous(UPPER + LOWER + NUM, options.avoidAmbiguous);
    return Array.from({ length }, () => pick(alphabet)).join("");
  }

  let alphabet = "";
  const required: string[] = [];
  if (options.uppercase) {
    const set = filterAmbiguous(UPPER, options.avoidAmbiguous);
    alphabet += set;
    required.push(pick(set));
  }
  if (options.lowercase) {
    const set = filterAmbiguous(LOWER, options.avoidAmbiguous);
    alphabet += set;
    required.push(pick(set));
  }
  if (options.numbers) {
    const set = filterAmbiguous(NUM, options.avoidAmbiguous);
    alphabet += set;
    required.push(pick(set));
  }
  if (options.symbols) {
    const set = filterAmbiguous(SYM, options.avoidAmbiguous);
    alphabet += set;
    required.push(pick(set));
  }
  if (!alphabet) {
    throw new Error("Select at least one character set.");
  }
  const chars = [...required];
  while (chars.length < length) chars.push(pick(alphabet));
  return shuffle(chars).join("").slice(0, length);
}

export const DEFAULT_GENERATOR: GeneratorOptions = {
  kind: "password",
  length: 24,
  uppercase: true,
  lowercase: true,
  numbers: true,
  symbols: true,
  avoidAmbiguous: true,
};
