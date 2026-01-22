import { Landing } from '@/shared/types/blocks/landing';
import {
  CTA,
  FAQ,
  Features,
  FeaturesAccordion,
  FeaturesList,
  FeaturesStep,
  Hero,
  Logos,
  Showcases,
  Stats,
  Subscribe,
  Testimonials,
} from '@/themes/default/blocks';

export default async function LandingPage({
  locale,
  page,
}: {
  locale?: string;
  page: Landing;
}) {
  return (
    <>
      {page.hero && <Hero hero={page.hero} />}
      {page.logos && <Logos logos={page.logos} />}
      {page.introduce && (
        <FeaturesList
          features={page.introduce}
          className="bg-gradient-to-b from-background via-muted/5 to-muted/20"
        />
      )}
      {page.benefits && (
        <FeaturesAccordion
          features={page.benefits}
          className="bg-muted/20"
        />
      )}
      {page.usage && (
        <FeaturesStep
          features={page.usage}
          className="bg-gradient-to-b from-muted/20 to-background"
        />
      )}
      {page.features && (
        <Features
          features={page.features}
          className="bg-background relative overflow-hidden before:absolute before:inset-0 before:bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] before:from-primary/5 before:to-transparent"
        />
      )}
      {page.stats && (
        <Stats
          stats={page.stats}
          className="bg-muted/30 border-y border-white/5"
        />
      )}
      {page.showcases && (
        <Showcases
          showcases={page.showcases}
          className="bg-gradient-to-b from-background to-muted/10"
        />
      )}
      {page.testimonials && (
        <Testimonials
          testimonials={page.testimonials}
          className="bg-muted/10"
        />
      )}
      {page.subscribe && (
        <Subscribe
          subscribe={page.subscribe}
          className="bg-muted/40 border-t border-white/5"
        />
      )}
      {page.faq && <FAQ faq={page.faq} />}
      {page.cta && (
        <CTA
          cta={page.cta}
          className="bg-gradient-to-t from-primary/10 to-background border-t border-white/5"
        />
      )}
    </>
  );
}
