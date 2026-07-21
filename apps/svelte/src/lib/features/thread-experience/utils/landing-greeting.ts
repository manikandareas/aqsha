export function landingGreeting(firstName: string, hour: number): string {
	const timeOfDay =
		hour >= 5 && hour < 11
			? 'pagi'
			: hour >= 11 && hour < 15
				? 'siang'
				: hour >= 15 && hour < 18
					? 'sore'
					: 'malam';

	return firstName ? `Selamat ${timeOfDay}, ${firstName}` : `Selamat ${timeOfDay}`;
}
