<script>
import Game from "@/game";

import FilterBox from "@/ui/components/filterbox.vue";
import ItemsBase from "@/ui/itemsBase";
import { TRY_BUY } from "@/events";

export default {
	mixins: [ItemsBase],
	data() {
		return {
			/**
			 * @property {Item[]} filtered - filtered search results.
			 */
			filtered: null,
		};
	},

	components: {
		inv: () => import(/* webpackChunkName: "inv-ui" */ "./inventory.vue"),
		filterbox: FilterBox,
	},
	beforeCreate() {
		this.game = Game;
	},
	methods: {
		searchPotion(potion, target) {
			const groups = target.split("|");
			for (let i = 0; i < groups.length; i++) {
				if (groups[i].length == 0) continue;
				const mandatory = groups[i].split(" ");
				let passed = true;
				for (let j = 0; j < mandatory.length; j++) {
					if (mandatory[j].length == 0) continue;
					const term = mandatory[j].replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
					if (this.crawlPotion(potion, new RegExp(term, "i"))) continue;
					passed = false;
					break;
				}
				if (passed) return true;
			}
			return false;
		},
		crawlPotion(potion, regex) {
			if (potion.template) return this.crawlTemplate(potion.template, regex);
			const items = potion.items;
			for (let i = 0; i < items.length; i++) if (this.crawlPotion(items[i], regex)) return true;
			return false;
		},
		crawlTemplate(template, regex) {
			if (template.dot && regex.test("buffs")) return true;
			if (template.summon && regex.test("summons")) return true;
			if (template.cost) for (let c in template.cost) if (this.crawlProperty(c, regex)) return true;

			for (let k in template) {
				if (
					k == "desc" ||
					k == "flavor" ||
					k == "require" ||
					k == "buy" ||
					k == "cost" ||
					k == "need" ||
					k == "needtext"
				)
					continue;
				if (this.crawlProperty(template[k], regex)) return true;
			}
			return false;
		},
		crawlObject(obj, regex) {
			for (let k in obj) {
				if (this.crawlProperty(k, regex)) return true;
				if (this.crawlProperty(obj[k], regex)) return true;
			}
			return false;
		},
		crawlProperty(prop, regex) {
			const type = typeof prop;
			if (type == "object" || type == "array") return this.crawlObject(prop, regex);

			if (type != "string") prop = prop.toString();
			const split = prop.split(/\.|=|<|>|!|,|&&|\|\||\(|\)|\+|\-|'/);
			for (let i = 0; i < split.length; i++) {
				const str = split[i];
				if (/^[0-9\*\~\%]*$/.test(str)) continue;
				if (/^[a-zA-Z0-9_ ]*$/.test(str)) {
					const data = Game.state.getData(str);
					if (data) {
						if (regex.test(data.name)) return true;
						continue;
					}
				}
				if (regex.test(str)) return true;
			}
			return false;
		},
	},
	computed: {
		potions() {
			return Game.state.potions.filter(v => !this.locked(v));
		},
		BUY() {
			return TRY_BUY;
		},
	},
};
</script>

<template>
	<div class="potions">
		<filterbox v-model="filtered" :items="potions" :prop="searchPotion" />

		<div class="potion-col">
			<div
				v-for="it in filtered"
				class="separate"
				:key="'sect-pot-' + it.id"
				@mouseenter.capture.stop="itemOver($event, it)">
				<span>{{ it.name.toTitleCase() }}</span>

				<button
					type="button"
					v-if="it.buy && !it.owned"
					:disabled="!it.canBuy(game) || (game.state.inventory.full() && !game.state.inventory.findMatch(it))"
					@click="emit(BUY, it)">
					🔒
				</button>
				<button
					v-else
					type="button"
					:disabled="!it.canUse() || (game.state.inventory.full() && !game.state.inventory.findMatch(it))"
					@click="emit('craft', it)">
					酿造
				</button>
			</div>
		</div>
	</div>
</template>

<style scoped>
div.potions .potion-col {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(10rem, 0.5fr));
	column-gap: var(--lg-gap);
	overflow-x: hidden;
	width: 100%;
}

div.flex-col .separate {
	width: 48%;
}

div.potions {
	padding: 0 1rem;
}
</style>
