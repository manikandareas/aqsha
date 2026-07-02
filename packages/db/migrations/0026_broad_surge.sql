CREATE TABLE "user_agent_preferences" (
	"owner_user_id" text PRIMARY KEY NOT NULL,
	"answer_language" text,
	"citation_style" text,
	"response_style" text,
	"custom_instruction" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "user_agent_preferences_answer_language_check" CHECK ("user_agent_preferences"."answer_language" is null or "user_agent_preferences"."answer_language" in ('id', 'en')),
	CONSTRAINT "user_agent_preferences_citation_style_check" CHECK ("user_agent_preferences"."citation_style" is null or "user_agent_preferences"."citation_style" in ('apa7', 'mla', 'chicago', 'ieee', 'vancouver', 'harvard')),
	CONSTRAINT "user_agent_preferences_response_style_check" CHECK ("user_agent_preferences"."response_style" is null or "user_agent_preferences"."response_style" in ('ringkas', 'seimbang', 'lengkap'))
);
--> statement-breakpoint
ALTER TABLE "user_agent_preferences" ADD CONSTRAINT "user_agent_preferences_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE cascade ON UPDATE no action;