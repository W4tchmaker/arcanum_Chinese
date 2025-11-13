<script setup>
import game from "@/game";
import settings from "@/modules/settings";
import upgrades from "@/ui/panes/upgrades.vue";
import { computed, ref, watchEffect } from "vue";

const props = defineProps(["id", "group", "preventClick"]);

const titleMap = {
	"affluence": '财富',
	"apprenticeship": '学徒',
	"crafting": '制造',
	"materials": '材料',
	"other": '其他',
	"research": '研究',
	"advancement": '提升',
	"rest": '休息',
	"exploration": '探索',
	"knowledge": '知识',
	"mount": '坐骑',
	"sublimation": '升华',
	"magic": '魔法',
	"body": '身体',
	"education": '教育',
	"furniture": '家具',
	"imbuement": '灌魔',
	"housing":"住房",
	"martial": '武术',
	"special": '特殊',
	"storage": '存储',
	"minions": '随从',
	"familliar": '使魔',
	"spellcasting": '法术施放',
	"actions": '动作',
	"starting out": "初始"
};

const toTitleCase = (str) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase().replace(/_(\w)/g, (match, char) => ' ' + char.toUpperCase());
};

const prop = computed(() => {
	const [key, items] = props.group;
	const title = titleMap[key] ?? toTitleCase(key);
	return {
		key: key,
		title: title,
		items: items,
	};
});

const id = computed(() => `taskGroup_${props.id}_${game.state.pid}`);

const isOpen = ref(true);

watchEffect(() => {
	isOpen.value = settings.getSubVar(id.value, prop.value.key) ?? true;
});

function toggle() {
	isOpen.value = settings.setSubVar(id.value, prop.value.key, !isOpen.value);
}
</script>

<template>
	<div class="taskgroup">
		<div class="titlebar" @click="toggle">
			<span class="arrows">{{ isOpen ? "▼" : "▶" }}</span>
			<span>{{ prop.title }}</span>
			<span>{{ isOpen ? "▼" : "◄" }}</span>
		</div>
		<div v-if="isOpen">
			<upgrades class="task-list" :items="prop.items" :preventClick="props.preventClick" />
		</div>
	</div>
</template>

<style scoped>
div.taskgroup {
	padding: 1px var(--sm-gap);
}

div.titlebar {
	display: grid;
	grid-template-columns: 5% 90% 5%;
	cursor: pointer;
	border: 1px solid #8888;
	background-color: #8881;
	text-align: center;
}
.darkmode .titlebar {
	border: 1px solid black;
}

div.task-list {
	padding: var(--md-gap);
	display: grid;
	justify-items: center;
	grid-template-columns: repeat(auto-fit, var(--task-button-width));
}

div.task-list .runnable:hover {
	background: var(--accent-color-hover);
}

div.task-list .runnable:active {
	background: var(--accent-color-active);
}
</style>
