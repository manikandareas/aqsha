
import { cn } from "@/lib/utils";

interface Props {
	className?: string;
	href?: string;
}

export const LogoLink = ({ className, href = "/" }: Props) => {
	return (
		<a href={href} className={cn("flex items-center gap-2", className)}>
			<LogoType />
		</a>
	);
};

export const LogoType = ({ className }: { className?: string }) => {
	return (
		<img
			src={"/logo.png"}
			alt="Aqsha logo"
			width={32}
			height={32}
			className={cn("w-[32px] h-[32px]", className)}
		/>
	);
};

export const LogoWithText = ({ className }: { className?: string }) => {
	return (
		<div className="flex items-center gap-2">
			<img
				src={"/logo.png"}
				alt="Aqsha logo"
				width={32}
				height={32}
				className={cn("w-[32px] h-[32px]", className)}
			/>
			<p className={cn("text-lg font-semibold tracking-tighter", className)}>
				Aqsha
			</p>
		</div>
	);
};
