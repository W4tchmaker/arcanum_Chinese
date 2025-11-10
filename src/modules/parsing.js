import Mod, { ModTest } from "../values/mods/mod";
import PerMod, { IsPerMod } from "../values/mods/permod";
import { splitKeys, logObj, splitKeyPath, freezeData } from "@/util/util";
import RValue, { SubPath } from "../values/rvals/rvalue";
import Stat from "@/values/rvals/stat";

import { MakeDmgFunc } from "@/values/combatVars";

import Range, { RangeTest } from "../values/range";
import Percent, { PercentTest } from "../values/percent";
import AtMod, { IsAtMod } from "../values/mods/atmod";

import { FP, TYP_FUNC, TYP_RVAL } from "@/values/consts";
import RangedMod, { isRangedMod } from "../values/mods/rangedmod";
import CurvedMod, { isCurvedMod } from "../values/mods/curvedmod";
import FValue from "@/values/rvals/fvalue";
import { cloneClass } from "@/util/objecty";

/**
 * @const {RegEx} IdTest - Test for a simple id name.
 */
const IdTest = /^[A-Za-z_]+\w*$/;

/**
 * Parse object into modifiers.
 * @param {} mods
 * @returns {Object} parsed modifiers.
 */
export const ParseMods = (mods, id, source) => {
	if (!mods) return null;
	if (!id && source && typeof source === "object") {
		id = source.id;
		if (!id) {
			id = "";
			logObj(mods, "No Mod Id: " + source + ": " + id);
		}
	}

	mods = SubMods(mods, id, source);
	if (!mods) console.warn("mods is null: " + id);

	// @todo: no more key splitting. item tables?
	splitKeys(mods);

	return mods;
};

/**
 * Parse a string source into a Mod class.
 * @param {string} str - mod str.
 * @param {string} id - mod id.
 * @param {object} src - mod source.
 * @returns {Mod|string}
 */
export const StrMod = (str, id, src) => {
	if (ModTest.test(str) || !isNaN(str)) return new Mod(str, id, src);
	if (IsPerMod(str)) return new PerMod(str, id, src);
	else if (IsAtMod(str)) return new AtMod(str, id, src);
	else if (isRangedMod(str)) return new RangedMod(str, id, src);
	else if (isCurvedMod(str)) return new CurvedMod(str, id, src);
	return str;
};

/**
 *
 */
const SubMods = (mods, id, source) => {
	if (mods === null || mods === undefined) return null;

	if (typeof mods === "string") {
		return StrMod(mods, id, source);
	} else if (typeof mods === "number") {
		return new Mod(mods, id, source);
	} else if (typeof mods !== "object") {
		// @note includes boolean (unlock) mods.
		//console.log( id + ' unknown mod type: ' + (typeof mods) + ' source: ' + source )
		return mods;
	}

	// @note str is @compat
	if (mods.id || mods.base || mods.str) return new Mod(mods, id, source);

	for (const s in mods) {
		const val = mods[s];
		if (val === 0) {
			delete mods[s];
			continue;
		}
		// @note this includes 0 as well.
		if (!val) continue;

		if (val instanceof Mod) {
			if (id) val.id = SubPath(id, s);
			//console.log('NEW MOD ID: ' +SubPath(id, s) );
			val.source = source;
			continue;
		}

		mods[s] = SubMods(val, SubPath(id, s), source);
	}
	return mods;
};

/**
 * Prepared data is instance-level data, but classes have not been instantiated.
 * @param {*} sub
 * @param {*} id
 */
export const PrepData = (sub, id = "") => {
	if (Array.isArray(sub)) {
		for (let i = sub.length - 1; i >= 0; i--) sub[i] = PrepData(sub[i], id);
	} else if (typeof sub === "object") {
		for (const p in sub) {
			if (p === "mod" || p === "runmod" || p === "alter") {
				sub[p] = ParseMods(sub[p], SubPath(id, p));
				continue;
			} else if (p === "effect" || p === "result" || p === "use" || p === "acquire" || p === "loot") {
				sub[p] = ParseEffects(sub[p], MakeEffectFunc);
			} else if (p === "cost" || p === "buy" || p === "sell") {
				sub[p] = ParseEffects(sub[p], MakeCostFunc);
			} else if (p === "require" || p === "need") {
				sub[p] = ParseRequire(sub[p]);
				continue;
			} else if (p === "convert") {
				sub[p]["input"] = ParseEffects(sub[p]["input"], MakeEffectFunc);
				sub[p]["output"]["effect"] = ParseEffects(sub[p]["output"]["effect"], MakeEffectFunc);
				sub[p]["output"]["mod"] = ParseMods(sub[p]["output"]["mod"], SubPath(id, "mod"));
			} else if (p === "dotcondition" || p === "restrate") {
				sub[p] = MakeDmgFunc(sub[p]);
			}

			if (p.includes(".")) splitKeyPath(sub, p);

			const obj = sub[p];
			const typ = typeof obj;
			if (typ === "string") {
				if (PercentTest.test(obj)) {
					sub[p] = new Percent(obj);
				} else if (RangeTest.test(obj)) sub[p] = new Range(obj);
				else if (IsPerMod(obj)) sub[p] = new PerMod(obj, SubPath(id, p));
				else if (isRangedMod(obj)) return new RangedMod(obj, SubPath(id, p));
				else if (isCurvedMod(obj)) return new CurvedMod(obj, SubPath(id, p));
				else if (!isNaN(obj)) {
					if (obj !== "") console.warn("string used as Number: " + p + " -> " + obj);
					sub[p] = Number(obj);
				} else if (p === "damage" || p === "dmg") sub[p] = MakeDmgFunc(obj);
				else if (p === "healing" || p === "heal") sub[p] = MakeDmgFunc(obj);
			} else if (typ === "object") PrepData(obj, id);
			else if (typ === "number") {
				//sub[p] = new RValue(obj);
			}
		}

		// split AFTER parse so items can be made into full classes first.
		/*for( let p in sub ) {
			if ( p.includes('.')) splitKeyPath( sub, p );
		}*/
	} else if (typeof sub === "string") {
		return ParseRVal(sub);
	}

	return sub;
};

/**
 * Attempt to convert a string to RValue.
 * @param {string} str
 * @returns {RValue|number|str}
 */
export const ParseRVal = str => {
	if (RangeTest.test(str)) return new Range(str);
	else if (PercentTest.test(str)) return new Percent(str);
	else if (IsPerMod(str)) return new PerMod(str);
	else if (IsAtMod(str)) return new AtMod(str);
	else if (isRangedMod(str)) return new RangedMod(str);
	else if (isCurvedMod(str)) return new CurvedMod(str);
	return str;
};
/**
 *
 * @param {object|string|Array|Number} effects
 * @param {Function} funcMaker - Function that returns a new function to use in any function RValues.
 * (cost func, effect func, attack func, etc.)
 */
export const ParseEffects = (effects, funcMaker) => {
	if (Array.isArray(effects)) {
		for (let i = effects.length - 1; i >= 0; i--) {
			effects[i] = ParseEffects(effects[i], funcMaker);
		}
	} else if (typeof effects === "string") {
		if (RangeTest.test(effects)) return new Range(effects);
		else if (PercentTest.test(effects)) return new Percent(effects);
		else if (IsPerMod(effects)) return new PerMod(effects);
		else if (IsAtMod(effects)) return new AtMod(effects);
		else if (isRangedMod(effects)) return new RangedMod(effects);
		else if (isCurvedMod(effects)) return new CurvedMod(effects);
		else if (effects.includes(".")) return funcMaker(effects);

		return effects;
	} else if (typeof effects === "object") {
		for (const p in effects) {
			if (effects[p]?.type == TYP_FUNC || effects[p]?.type == TYP_RVAL) continue;
			if (p !== "dot" && p !== "attack") effects[p] = ParseEffects(effects[p], funcMaker);
		}
	} else if (typeof effects === "number") return new Stat(effects);

	return effects;
};

/**
 * Parse a requirement-type object.
 * currently: 'require' or 'need'
 */
export const ParseRequire = sub => {
	// REQUIRE
	if (sub === null || sub === undefined || sub === false || sub === "") return undefined;
	if (Array.isArray(sub)) {
		for (let i = sub.length - 1; i >= 0; i--) sub[i] = ParseRequire(sub[i]);
	} else if (typeof sub === "string" && !IdTest.test(sub)) return MakeTestFunc(sub);

	return sub;
};

/**
 * Create a boolean testing function from a data string.
 * @param {string} text - function text.
 */
export function MakeTestFunc(text) {
	/**
	 * g - game data
	 * i - item being tested for unlock.
	 * s - game state
	 */
	return new Function(FP.GDATA, FP.ITEM, FP.STATE, "return " + text);
}

/**
 * Cost function. params: GameState, Actor.
 * @param {*} text
 */
export function MakeCostFunc(text) {
	return new FValue([FP.GDATA, FP.ACTOR], text);
}

/**
 * Create a function which performs an arbitrary effect.
 * player and target params are given for simplicity.
 * target is the current target (of a dot), if any.
 * @param {string} text
 */
export function MakeEffectFunc(text) {
	return new FValue([FP.GDATA, FP.TARGET, FP.ACTOR], text);
}

/**
 * Sets default values on target if the properties within default do no exist on target.
 * Mutates target.
 * Defaults should be an object where all properties and subproperties resembles the template in the data files or a function that returns such an object.
 * @param {*} target Target to set defaults for.
 * @param {*} defaults Values to be set on target if corresponding properties do not exist.
 * @returns {*} Object containing all properties that were set in target, along with the corresponding values.
 */
export function setDefaults(target, defaults, template) {
	/*
	 * Steps for proper default assigning to occur:
	 *  1. Get the template
	 *     - The template is needed to make sure that the defaults don't overwrite anything already defined in the template.
	 *       However, the fact that the template does not have something defined does not mean it should be assigned (due to vars containing a merge of template and game data)
	 *
	 *  2. Get the defaults
	 *     - Defaults are provided, and if it's a function, that means the defaults is dependant on the target/template.
	 *     - The expected format of the defaults should be similar to a template. There should be no instanced classes within the defaults object.
	 *
	 *  Optional: Find out what properties (and subproperties) have been deefined in the template
	 *     - To prevent trying to prep and assign defaults that are already defined.
	 *     - Not necessary as any properties defined on the template should also be defined on the target, and won't be assigned in later steps,
	 *       and toJSON's comparison for defaults shouldn't cause any issues alongside the template comparison.
	 *
	 *  3. Prep the defaults
	 *     - Parse and prep the defaults through parsing.js's PrepData. This is why this function can't be in the util.js file.
	 *     - Note: By this point, all the defaults have been finalized, and part of the return value is the defaults that have been defined before this step.
	 *
	 *  4. Assign the defaults to the object
	 *     - Shallowly assign the prepped defaults to the target. If a property already exists, ignore the default value.
	 *     - Partially applied defaults should not be handled by setDefaults. However, that does not mean it cannot occur;
	 *       As a workaround, use a defaults-generating function to assign the values directly onto the target, then return the expected output in the function's return object.
	 *       Keep in mind that such workarounds may have unintended consequences.
	 *
	 *  5. Return both the defaults template and the assigned defaults.
	 *     - Note: Defaults is frozen, cause it's a template-like object.
	 *             For defaults parameter that is an object, the original object is being frozen, but that should not pose an issue as it should not be modified to begin with.
	 */

	// 1. Get the template
	if (!template) {
		if (target.template) {
			template = target.template;
		} else {
			console.warn("No template found. Using target as template.", target);
			template = target;
		}
	}

	// 2. Get the defaults
	if (defaults instanceof Function) defaults = defaults(target, template);

	// 3. Prep the defaults
	let preppedDefaults = PrepData(cloneClass(defaults), target.id);

	// 4. Assign the defaults to the target
	const assigned = {};
	for (const p in preppedDefaults) {
		if (target[p] == null) assigned[p] = target[p] = preppedDefaults[p];
	}

	// 5. Return both the defaults template and the assigned defaults.
	return [freezeData(defaults), assigned];
}
