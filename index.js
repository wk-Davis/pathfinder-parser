const _ = require('lodash');

const fs = require('fs');

const raw = fs.readFileSync('./texts/companions.txt', 'utf8');

const sizeExp = new RegExp(/Size:? (\w{4,6})(?:,|;)/);
const armorExp = new RegExp(/AC (?<bonus>\+\d+)/);
const statsArray = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

function parseSize(line) {
  const size = sizeExp.exec(line);
  if (Array.isArray(size)) return { size: size[1].toLowerCase() };
}

function parseSpeed(line) {
  const speedExp = new RegExp(
    /((?<type>[a-zA-Z]*) (?<rate>\d\d) ft.( \((?<maneuv>[a-z]+)\))?)/,
    'g'
  );
  const speeds = line.matchAll(speedExp);
  const ref = { speed: {} };
  for (const movement of speeds) {
    const [type, rate, maneuv] = Object.values(movement.groups).map(
      (value, i) => {
        if (!value) return;
        return i === 1 ? parseInt(value) : value.toLowerCase();
      }
    );
    if (type === 'speed') ref.speed.base = rate;
    else if (type === 'fly') {
      ref.speed.fly = rate;
      ref.speed.maneuverability = maneuv;
    } else ref.speed[type] = rate;
  }
  return ref;
}

function parseNatArmor(line) {
  const ref = {};
  const armor = armorExp.exec(line);
  if (armor)
    ref.bonuses = [
      {
        stat: 'ac',
        value: armor[1],
        type: 'armor',
        desc: 'natural armor'
      }
    ];
  return ref;
}

function parseStats(line) {
  const statsExp = new RegExp(
    statsArray.map(stat => `${stat} (?<${stat}>\\d+)(,|;)`).join(' '),
    'gi'
  );
  const ref = {};
  const stats = statsExp.exec(line);
  if (stats && stats.groups) {
    statsArray.forEach(stat => {
      ref[stat] = parseInt(stats.groups[stat]);
    });
  }
  return ref;
}

function parseSpecQualities(line) {
  const specQualitiesExp = new RegExp(
    /Special (?:Qualities|Abilities) (?<abilities>[a-z-,\(\) ]+)/,
    'gi'
  );
  const ref = {};
  const specQualities = specQualitiesExp.exec(line);
  if (specQualities) ref.specialQualities = specQualities[1].split(', ');
  return ref;
}
function parseAttacks(line) {
  const captureGroups = _.times(
    4,
    i =>
      `((?<name${i}>[\\da-z ]+)(?<secondarya${i}>\\*)?\\((?:(?<dmg${i}>\\d+d\\d+)( plus (?<plus${i}>\\w+))?)\\)(?<secondaryb${i}>\\*)?)?`
  );
  const attacksExp = new RegExp(`Attacks? ${captureGroups.join('.')}`, 'gi');
  const ref = { attacks: [] };
  const [...attacks] = line.matchAll(attacksExp);
  if (attacks) {
    attacks.forEach(atk => {
      /* Ranged, Special, or Alternative attacks must be added/edited manually */
      _.times(4, i => {
        if (atk.groups[`name${i}`] === undefined) return;
        const type = atk.groups[`name${i}`].replace(/\d/, '').trim();
        const dmgType = {
          bite: 'b, p, s',
          claw: 'b, s',
          claws: 'b, s',
          gore: 'p',
          hooves: 'b',
          tentacles: 'b',
          wings: 'b',
          pincers: 'b', // never used
          tail: 'b',
          'tail slap': 'b',
          slam: 'b',
          sting: 'p',
          talons: 's'
        }[type];
        const attackObj = {
          name: atk.groups[`name${i}`].trim(),
          type: 'natural',
          damage: atk.groups[`dmg${i}`],
          damageType: dmgType
        };
        if (atk.groups[`secondarya${i}`] || atk.groups[`secondaryb${i}`])
          attackObj.secondary = true;
        if (atk.groups[`plus${i}`]) attackObj.plus = atk.groups[`plus${i}`];
        ref.attacks.push(attackObj);
      });
    });
    return ref;
  }
}
function parseStatChanges(line) {
  const statsExps = statsArray.map(
    stat => new RegExp(`${stat} (?<${stat}>[\\W\\D\\S]?\\d+)(,|;)`, 'gi')
  );
  const ref = {};
  statsExps.forEach((exp, i) => {
    const stat = exp.exec(line.slice(0));
    if (stat && stat.groups) ref[statsArray[i]] = stat.groups[statsArray[i]];
  });
  return ref;
}
function parseSpecAttacks(line) {
  const attacksExp = new RegExp(
    /Special Attacks? ((?<name>[\da-z ]+)(?<secondary>\*)?\((?:(?<dmg>\d+d\d+)( plus (?<plus>\w+))?)\)(?<secondary1>\*)?,?)+/,
    'gi'
  );
  const ref = { specialAttacks: [] };
  const attacks = line.slice(0).matchAll(attacksExp);
  if (attacks) {
    for (const atk of attacks) {
      /* Ranged, Special, or Alternative attacks must be added/edited manually */
      const { name, dmg, plus, secondary0, secondary1 } = atk.groups;
      const dmgType = {
        bite: 'b, p, s',
        claw: 'b, s',
        claws: 'b, s',
        gore: 'p',
        hooves: 'b',
        tentacles: 'b',
        wings: 'b',
        pincers: 'b', // never used
        tail: 'b',
        'tail slap': 'b',
        slam: 'b',
        sting: 'p',
        talons: 's'
      }[name.replace(/\d/, '').trim()];
      const attackObj = {
        name: name.trim(),
        type: 'natural',
        damage: dmg,
        damageType: dmgType
      };
      if (secondary0 || secondary1) attackObj.secondary = true;
      if (plus) attackObj.plus = plus;
      ref.specialAttacks.push(attackObj);
    }
  }
  const specAttacksExp = new RegExp(
    /Special Attacks (?<abilities>[a-z-,\(\) ]+)/,
    'gi'
  );
  const specAttacks = specAttacksExp.exec(line.slice(0));
  if (specAttacks)
    ref.specialAttacks = ref.specialAttacks.concat(specAttacks[1].split(', '));

  if (ref.specialAttacks.length > 0) return ref;
  return {};
}
const array = raw.split('\n\n');
const json = array.reduce((final, str) => {
  const [nameRaw, ...lines] = str.split('\n');
  const name = nameRaw.toLowerCase();
  final[name] = {};
  if (lines[0].startsWith('Source'))
    final[name].source = lines[0].slice(lines[0].indexOf('e') + 1);
  const startStatsIndex = lines.findIndex(s => s === 'Starting Statistics');

  if (startStatsIndex > 1) final[name].description = lines[1];
  const objects = [
    parseSize,
    parseSpeed,
    parseStats,
    parseSpecQualities,
    parseAttacks,
    parseNatArmor
  ].map(func => func(lines[startStatsIndex + 1].slice(0)));

  const advObjects = [
    parseSize,
    parseAttacks,
    parseNatArmor,
    parseSpecQualities,
    parseStatChanges,
    parseSpecAttacks
  ].map(func => func(lines[startStatsIndex + 3].slice(0)));
  final[name] = _.merge(final[name], ...objects);
  final[name].advancements = _.merge(...advObjects, {
    level: parseInt(lines[startStatsIndex + 2].charAt(0))
  });

  return final;
}, {});

// console.log('\n\n%o', json);

fs.writeFile('test.json', JSON.stringify(json), function(err) {
  if (err) {
    return console.log(err);
  }
  console.log('The file was saved!');
});
