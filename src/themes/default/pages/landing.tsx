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





      {page.usage && (
        <FeaturesStep
          features={page.usage}
          className="bg-background"
        />
      )}

      {page.showcases && (
        <Showcases
          showcases={page.showcases}
          className="bg-background py-24"
        />
      )}

      {page.features && (
        <Features
          features={page.features}
          className="bg-muted/10"
        />
      )}

      {page.introduce && (
        <FeaturesList
          features={page.introduce}
          className="bg-background"
        />
      )}

      {page.benefits && (
        <FeaturesAccordion
          features={page.benefits}
          className="bg-muted/10"
        />
      )}

      {page.testimonials && (
        <Testimonials
          testimonials={page.testimonials}
          className="bg-background"
        />
      )}

      {page.faq && <FAQ faq={page.faq} />}

      {page.cta && (
        <CTA
          cta={page.cta}
          className="bg-gradient-to-t from-primary/20 to-background border-t border-[rgba(255,255,255,0.1)]"
        />
      )}
    </>
  );
}
