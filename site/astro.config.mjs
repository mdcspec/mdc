// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	site: 'https://mdcspec.dev',
	integrations: [
		starlight({
			title: 'MDC',
			description:
				'Markdown Checklists — task state that is valid Markdown, for humans and AI agents.',
			customCss: ['./src/styles/theme.css'],
			social: [
				{
					icon: 'github',
					label: 'GitHub',
					href: 'https://github.com/mdcspec/mdc',
				},
			],
			sidebar: [
				{ label: 'Home', link: '/' },
				{ label: 'Specification', link: '/spec/v0.1' },
				{ label: 'Conformance', link: '/conformance' },
				{ label: 'Implementations', link: '/implementations' },
			],
		}),
	],
});
