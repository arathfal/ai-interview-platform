import { Card, CardContent } from "@/components/ui/card";
import LevelBadge from "./LevelBadge";
import ConfidenceIndicator from "./ConfidenceIndicator";
import OverridePanel from "./OverridePanel";
import { Zap } from "lucide-react";
import { parseLevel } from "@/utils/constants";
import type { PortfolioSkill, AssessorOverride } from "@/types";
import { Link } from "react-router-dom";

interface SkillPortfolioCardProps {
  skill: PortfolioSkill;
  override?: AssessorOverride;
  onOverrideSaved: (override: AssessorOverride) => void;
  transcriptPath: string;
}

export default function SkillPortfolioCard({
  skill,
  override,
  onOverrideSaved,
  transcriptPath,
}: SkillPortfolioCardProps) {
  const effectiveLevel = override?.override_level ?? parseLevel(skill.ai_level);

  return (
    <Card id={`skill-${skill.id}`}>
      <CardContent className="p-4 space-y-4">
        {/* Skill header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <LevelBadge level={effectiveLevel} />
            <div className="space-y-0.5 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold truncate">{skill.skill_label}</span>
                {skill.is_discovered && (
                  <span className="flex items-center gap-0.5 text-xs text-amber-600 shrink-0">
                    <Zap className="h-3 w-3" /> Discovered
                  </span>
                )}
              </div>
              <ConfidenceIndicator confidence={skill.ai_confidence} />
            </div>
          </div>
          <OverridePanel skill={skill} existingOverride={override} onSaved={onOverrideSaved} />
        </div>

        {/* Low confidence note */}
        {skill.ai_confidence?.toLowerCase() === "low" && (
          <div className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded px-3 py-2">
            Only briefly explored. Confidence is low — warrants a dedicated session if this skill matters.
          </div>
        )}

        {/* Evidence */}
        {skill.evidence.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Evidence from interview
            </span>
            <ul className="space-y-1">
              {skill.evidence.map((citation, i) => (
                <li key={`${citation.turn_id ?? "legacy"}-${i}`} className="text-sm text-foreground">
                  {citation.verification_status === "verified" && citation.turn_number ? (
                    <div className="space-y-1">
                      <p>• “{citation.quote}”</p>
                      <Link
                        to={`${transcriptPath}?turn=${citation.turn_number}`}
                        className="inline-flex text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`View evidence in transcript, turn ${citation.turn_number}`}
                      >
                        Verified transcript turn {citation.turn_number}
                      </Link>
                    </div>
                  ) : (
                    <div>
                      <p>{citation.quote}</p>
                      <p className="text-xs text-muted-foreground">
                        Legacy evidence — transcript link unavailable
                      </p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {skill.evidence_status === "insufficient" && (
          <div role="status" className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded px-3 py-2">
            Insufficient verified transcript evidence. The skill assessment is retained, but no candidate quote is presented as verified.
          </div>
        )}

        {/* Competency summary */}
        {skill.competency_summary && (
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Competency summary
            </span>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {skill.competency_summary}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
