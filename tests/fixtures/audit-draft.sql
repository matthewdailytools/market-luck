-- Local CI fixture only: unpublished rows must never be returned by either public route.
INSERT INTO rounds(id,manifest,commitment,cutoff,ready,status)
VALUES('audit-draft-visibility-fixture','{}','private-not-published',1,2,'draft');
