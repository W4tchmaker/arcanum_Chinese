<script>
import { precise } from "@/util/format";

/**
 * Display of CharInfo stub.
 */
export default {
	/**
	 * @property {boolean} active - whether char is currently active.
	 */
	props: ["char", "active"],
	computed: {
		/**
		 * @property {object} rollOver - object to display on roll over.
		 */
		rollOver() {},

		empty() {
			return this.char.empty;
		},

		level() {
			return this.char.level;
		},
		gclass() {
			return this.char.gclass;
		},
		fame() {
			return precise(this.char.fame);
		},
	},
};
</script>

<template>
	<div :class="['char-info', empty ? 'empty' : '']">
		<div class="char-stats" v-if="!empty">
			<span class="fld-name">{{ char.name }} {{ char.title }}</span>
			<span v-if="gclass">{{ gclass.toString().toTitleCase() }}</span>
			<span v-if="level > 0">等级：{{ level }}</span>
			<span v-if="char.fame > 0">恶名： {{ fame }}</span>
			<span v-if="char.titles > 0">头衔: {{ char.titles }}</span>
		</div>
		<div v-else class="char-stats">
			<span class="fld-name">空席</span>
		</div>

		<div class="buttons">
			<button
				type="button"
				class="enter"
				v-if="!active"
				@click="$emit('load', char)"
				@mouseenter.capture.stop="itemOver($event, rollOver)">
				<span v-if="empty">开始</span><span v-else>唤醒</span>
			</button>

			<button type="button" class="dismiss" v-if="!active && !empty" @click="$emit('dismiss', char)">
				遣散
			</button>
			<!--<button type="button" class="dismiss" v-if="killable" @click="$emit('kill',char)">Murder</button>-->
		</div>
	</div>
</template>

<style scoped>
div.char-info {
	display: flex;
	flex-flow: column nowrap;
	border: 1px solid var(--separator-color);
	margin: var(--sm-gap);
	padding: var(--rg-gap);
	border-radius: var(--sm-gap);
	min-height: 12em;
	width: 10em;

	justify-content: space-between;
}

div.char-info .fld-name {
	text-align: center;
	width: 100%;
	font-size: 1.02rem;
	margin-bottom: var(--md-gap);
}

div.char-info div.buttons {
	display: flex;
	flex-flow: column nowrap;
}

div.char-info div.enter {
	width: 78%;
	justify-self: flex-end;
}

div.char-info.empty {
	background-color: var(--odd-list-color);
}

div.char-stats {
	display: flex;
	flex-flow: column nowrap;
}
</style>
